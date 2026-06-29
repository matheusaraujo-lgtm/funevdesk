import { canAccessTicket, getPermissions, requireCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { getSlaStatus, extendSlaAfterPause } from "@/lib/sla";
import { ensureCancelStatus, getTicketStatusMeta, listTicketStatuses } from "@/lib/ticket-statuses";
import { runEscalationCheck } from "@/lib/escalation";
import { getDb, makeId } from "@/lib/db";
import { dispatchWebhooks } from "@/lib/webhooks";
import { applyStockMovement } from "@/lib/inventory";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.string().min(2).max(40).optional(),
  assigneeId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  problemId: z.string().nullable().optional(),
  csatScore: z.number().int().min(1).max(5).optional(),
  csatComment: z.string().max(500).optional(),
  assume: z.boolean().optional(),
  cancel: z.boolean().optional(),
  cancelReason: z.string().max(1000).optional(),
  stockDeductions: z.array(z.object({
    itemId: z.string().min(1),
    qty: z.number().int().positive(),
  })).optional(),
});

function getTicket(db, id) {
  return db.prepare(`
    SELECT t.*, b.name branch_name, b.type branch_type,
      ob.name origin_branch_name, ob.type origin_branch_type,
      loc.name location_name,
      u.name requester_name, u.email requester_email,
      tt.name ticket_type_name, tt.description ticket_type_description, tt.checklist_json type_checklist_json,
      a.hostname, a.asset_type, a.os_name, a.ip_address, a.logged_user,
      a.status asset_status, a.cpu_percent, a.memory_percent, a.disk_percent,
      a.last_seen_at, a.mesh_node_id,
      assignee.name assignee_name, team.name team_name, svc.name service_name
    FROM tickets t
    JOIN branches b ON b.id=t.branch_id
    LEFT JOIN branches ob ON ob.id=t.origin_branch_id
    LEFT JOIN users u ON u.id=t.requester_id
    LEFT JOIN users assignee ON assignee.id=t.assignee_id
    LEFT JOIN teams team ON team.id=t.team_id
    LEFT JOIN services svc ON svc.id=t.service_id
    LEFT JOIN assets a ON a.id=t.asset_id
    LEFT JOIN locations loc ON loc.id=t.location_id
    LEFT JOIN ticket_types tt ON tt.id=t.ticket_type_id
    WHERE t.id=?
  `).get(id);
}

export async function GET(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const ticket = getTicket(db, id);
  if (!ticket) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });
  if (!canAccessTicket(currentUser, ticket)) return Response.json({ error: "Você não possui acesso a este chamado." }, { status: 403 });
  const responses = db.prepare(`
    SELECT tr.*, tf.options_json, tf.placeholder, tf.required, tf.position
    FROM ticket_responses tr
    LEFT JOIN ticket_fields tf ON tf.id = tr.field_id
    WHERE tr.ticket_id=?
    ORDER BY COALESCE(tf.position, 999), tr.id
  `).all(id);
  const attachments = db.prepare("SELECT * FROM attachments WHERE ticket_id=? ORDER BY created_at").all(id);
  const events = db.prepare("SELECT * FROM ticket_events WHERE ticket_id=? ORDER BY created_at DESC").all(id);
  const approvals = db.prepare(`
    SELECT ta.*, u.name approver_name, u.email approver_email
    FROM ticket_approvals ta JOIN users u ON u.id=ta.approver_id
    WHERE ta.ticket_id=? ORDER BY ta.requested_at DESC
  `).all(id);
  const canSeeInternal = getPermissions(currentUser).canManageTickets;
  const messages = db.prepare(`
    SELECT tm.*, u.role author_role, u.email author_email
    FROM ticket_messages tm
    LEFT JOIN users u ON u.id = tm.author_id
    WHERE tm.ticket_id=?
    ORDER BY tm.created_at
  `).all(id).filter((m) => m.visibility === "PUBLIC" || canSeeInternal);
  const equipmentTerm = db.prepare(`
    SELECT et.*, a.hostname, a.patrimony_number, a.equipment_type, a.asset_type, tt.name template_name, tt.title template_title, tt.body_text template_body
    FROM equipment_terms et
    JOIN assets a ON a.id=et.asset_id
    LEFT JOIN term_templates tt ON tt.id=et.term_template_id
    WHERE et.ticket_id=?
    ORDER BY et.created_at DESC LIMIT 1
  `).get(id);
  const ticketType = ticket.ticket_type_id
    ? db.prepare("SELECT requires_approval, approval_mode, default_approver_id, requires_term, term_template_id FROM ticket_types WHERE id=?").get(ticket.ticket_type_id)
    : null;
  const pendingApproval = approvals.find((a) => a.status === "PENDENTE") || null;
  const termTemplate = ticketType?.term_template_id
    ? db.prepare("SELECT id, name, title, body_text, body_html, layout_json FROM term_templates WHERE id=?").get(ticketType.term_template_id)
    : null;
  let templateLayout = null;
  try {
    templateLayout = termTemplate?.layout_json ? JSON.parse(termTemplate.layout_json) : null;
  } catch {
    templateLayout = null;
  }
  return Response.json({
    ticket, responses, attachments, events, approvals, messages,
    equipmentTerm: equipmentTerm || null,
    termTemplate: termTemplate ? {
      id: termTemplate.id,
      name: termTemplate.name,
      title: termTemplate.title,
      bodyText: termTemplate.body_text,
      bodyHtml: termTemplate.body_html || termTemplate.body_text,
      layoutJson: templateLayout,
    } : null,
    ticketTypeWorkflow: ticketType ? {
      requiresApproval: Boolean(ticketType.requires_approval),
      approvalMode: ticketType.approval_mode,
      requiresTerm: Boolean(ticketType.requires_term),
      termTemplateId: ticketType.term_template_id,
    } : null,
    pendingApproval,
    permissions: getPermissions(currentUser), currentUserId: currentUser.id,
    ticketStatuses: listTicketStatuses(db, ticket.organization_id),
    statusMeta: getTicketStatusMeta(db, ticket.organization_id, ticket.status),
  });
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const ticket = getTicket(db, id);
  if (!ticket) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });
  if (!canAccessTicket(currentUser, ticket)) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const permissions = getPermissions(currentUser);
  const now = new Date().toISOString();

  // Cancelamento pelo solicitante (criador do chamado): encerra o atendimento e avisa a equipe.
  // É a única transição de status que dispensa canManageTickets — quem abriu pode desistir.
  if (parsed.data.cancel) {
    const isRequester = ticket.requester_id && ticket.requester_id === currentUser.id;
    if (!isRequester && !permissions.canManageTickets) {
      return Response.json({ error: "Apenas o solicitante pode cancelar o chamado." }, { status: 403 });
    }
    const currentMeta = getTicketStatusMeta(db, ticket.organization_id, ticket.status);
    if (currentMeta?.is_terminal) {
      return Response.json({ error: "Este chamado já está encerrado." }, { status: 400 });
    }
    ensureCancelStatus(db, ticket.organization_id);
    const reason = (parsed.data.cancelReason || "").trim();
    const slaStatus = getSlaStatus(ticket.sla_due_at, "CANCELADO", { isTerminal: true });
    db.transaction(() => {
      db.prepare("UPDATE tickets SET status='CANCELADO', updated_at=?, resolved_at=?, sla_status=?, sla_paused_at=NULL WHERE id=?")
        .run(now, now, slaStatus, id);
      db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'STATUS_CHANGED', ?, ?)")
        .run(makeId("evt"), id, currentUser.id, currentUser.name,
          reason ? `Chamado cancelado pelo solicitante. Motivo: ${reason}` : "Chamado cancelado pelo solicitante.", now);
    })();
    if (ticket.assignee_id && ticket.assignee_id !== currentUser.id) {
      createNotification(db, {
        organizationId: ticket.organization_id, userId: ticket.assignee_id,
        eventType: "TICKET_CANCELLED", title: `Chamado #${ticket.number} cancelado`,
        body: reason || "O solicitante cancelou o chamado.", referenceId: id, referenceType: "TICKET",
      });
    }
    logAudit(db, { organizationId: ticket.organization_id, branchId: ticket.branch_id, actorId: currentUser.id, actorName: currentUser.name, entityType: "ticket", entityId: id, action: "CANCEL", details: JSON.stringify({ reason }) });
    dispatchWebhooks(db, ticket.organization_id, "TICKET_CANCELLED", {
      id, number: ticket.number, title: ticket.title, status: "CANCELADO",
      requesterId: ticket.requester_id, assigneeId: ticket.assignee_id, reason,
    });
    return Response.json({ ok: true });
  }

  if (parsed.data.status && permissions.canManageTickets && !parsed.data.assume) {
    const allowed = listTicketStatuses(db, ticket.organization_id);
    if (!allowed.some((item) => item.code === parsed.data.status)) {
      return Response.json({ error: "Situação inválida." }, { status: 400 });
    }
  }

  // Valida FKs contra a organização (evita mass-assignment cross-tenant).
  const orgId = ticket.organization_id;
  const belongsToOrg = (table, value) =>
    !value || db.prepare(`SELECT 1 FROM ${table} WHERE id=? AND organization_id=?`).get(value, orgId);
  if (parsed.data.assigneeId && !belongsToOrg("users", parsed.data.assigneeId)) {
    return Response.json({ error: "Responsável inválido." }, { status: 400 });
  }
  if (parsed.data.teamId && !belongsToOrg("teams", parsed.data.teamId)) {
    return Response.json({ error: "Equipe inválida." }, { status: 400 });
  }
  if (parsed.data.problemId && !belongsToOrg("problems", parsed.data.problemId)) {
    return Response.json({ error: "Problema inválido." }, { status: 400 });
  }

  // Baixa de estoque só vale na transição para um status terminal (resolução do chamado).
  const statusList = listTicketStatuses(db, orgId);
  const targetMeta = parsed.data.status ? statusList.find((item) => item.code === parsed.data.status) : null;
  const willResolve = Boolean(targetMeta?.is_terminal) && permissions.canManageTickets && !parsed.data.assume;
  const stockDeductions = willResolve ? (parsed.data.stockDeductions || []) : [];
  for (const deduction of stockDeductions) {
    const item = db.prepare("SELECT id, name, quantity FROM inventory_items WHERE id=? AND organization_id=?").get(deduction.itemId, orgId);
    if (!item) return Response.json({ error: "Item de estoque inválido." }, { status: 400 });
    if (item.quantity < deduction.qty) return Response.json({ error: `Estoque insuficiente para "${item.name}".` }, { status: 400 });
  }

  const update = db.transaction(() => {
    if (parsed.data.status && permissions.canManageTickets && !parsed.data.assume) {
      const allowed = listTicketStatuses(db, ticket.organization_id);
      const newMeta = allowed.find((item) => item.code === parsed.data.status);
      const oldMeta = getTicketStatusMeta(db, ticket.organization_id, ticket.status);
      let slaDueAt = ticket.sla_due_at;
      let slaPausedAt = ticket.sla_paused_at;

      if (oldMeta?.pauses_sla && !newMeta.pauses_sla && slaPausedAt) {
        slaDueAt = extendSlaAfterPause(slaDueAt, slaPausedAt);
        slaPausedAt = null;
      } else if (newMeta.pauses_sla && !oldMeta?.pauses_sla) {
        slaPausedAt = now;
      }

      const resolvedAt = newMeta.is_terminal ? now : (ticket.resolved_at && !newMeta.is_terminal ? null : ticket.resolved_at);
      const slaStatus = getSlaStatus(slaDueAt, parsed.data.status, {
        pausesSla: newMeta.pauses_sla,
        isTerminal: newMeta.is_terminal,
      });

      db.prepare("UPDATE tickets SET status=?, updated_at=?, resolved_at=?, sla_status=?, sla_due_at=?, sla_paused_at=? WHERE id=?")
        .run(parsed.data.status, now, resolvedAt, slaStatus, slaDueAt, slaPausedAt, id);

      db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'STATUS_CHANGED', ?, ?)")
        .run(makeId("evt"), id, currentUser.id, currentUser.name, `Situação alterada para ${newMeta.label}.`, now);

      if (newMeta.is_terminal && ticket.requester_id) {
        createNotification(db, { organizationId: ticket.organization_id, userId: ticket.requester_id, eventType: "TICKET_RESOLVED", title: `Chamado #${ticket.number} resolvido`, body: "Avalie o atendimento recebido.", referenceId: id, referenceType: "TICKET" });
      }
      if (newMeta.is_terminal) {
        for (const deduction of stockDeductions) {
          const result = applyStockMovement(db, {
            itemId: deduction.itemId, ticketId: id, userId: currentUser.id,
            quantity: deduction.qty, movementType: "SAIDA",
            notes: `Baixa confirmada na resolução do chamado #${ticket.number}.`,
          });
          const itemName = db.prepare("SELECT name, unit FROM inventory_items WHERE id=?").get(deduction.itemId);
          db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'STOCK_OUT', ?, ?)")
            .run(makeId("evt"), id, currentUser.id, currentUser.name, `Saída de estoque: ${deduction.qty} ${itemName?.unit || "un"} de ${itemName?.name || "item"} (restam ${result.quantity}).`, now);
        }
      }
    }
    if (parsed.data.assume && permissions.canManageTickets) {
      const newStatus = ticket.status === "ABERTO" ? "EM_ATENDIMENTO" : ticket.status;
      db.prepare("UPDATE tickets SET assignee_id=?, status=?, updated_at=? WHERE id=?").run(currentUser.id, newStatus, now, id);
      if (ticket.requester_id && ticket.requester_id !== currentUser.id) {
        createNotification(db, { organizationId: ticket.organization_id, userId: ticket.requester_id, eventType: "TICKET_ASSIGNED", title: `Chamado #${ticket.number} em atendimento`, body: `${currentUser.name} assumiu seu chamado.`, referenceId: id, referenceType: "TICKET" });
      }
      db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'ASSIGNED', ?, ?)")
        .run(makeId("evt"), id, currentUser.id, currentUser.name, `${currentUser.name} assumiu o chamado.`, now);
      if (newStatus !== ticket.status) {
        const slaStatus = getSlaStatus(ticket.sla_due_at, newStatus);
        db.prepare("UPDATE tickets SET sla_status=? WHERE id=?").run(slaStatus, id);
        db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'STATUS_CHANGED', ?, ?)")
          .run(makeId("evt"), id, currentUser.id, currentUser.name, "Situação alterada para EM_ATENDIMENTO.", now);
      }
    } else if (parsed.data.assigneeId !== undefined && permissions.canManageTickets) {
      db.prepare("UPDATE tickets SET assignee_id=?, updated_at=? WHERE id=?").run(parsed.data.assigneeId, now, id);
      if (parsed.data.assigneeId) {
        createNotification(db, { organizationId: ticket.organization_id, userId: parsed.data.assigneeId, eventType: "TICKET_ASSIGNED", title: `Chamado #${ticket.number} atribuído`, body: ticket.title, referenceId: id, referenceType: "TICKET" });
        db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'ASSIGNED', ?, ?)")
          .run(makeId("evt"), id, currentUser.id, currentUser.name, "Responsável atualizado.", now);
      }
    }
    if (parsed.data.teamId !== undefined && permissions.canManageTickets) {
      db.prepare("UPDATE tickets SET team_id=?, updated_at=? WHERE id=?").run(parsed.data.teamId, now, id);
    }
    if (parsed.data.problemId !== undefined && permissions.canManageTickets) {
      db.prepare("UPDATE tickets SET problem_id=?, updated_at=? WHERE id=?").run(parsed.data.problemId, now, id);
    }
    if (parsed.data.csatScore) {
      // CSAT só pelo solicitante, em chamado RESOLVIDO e sem nota anterior (anti-tampering de métrica).
      db.prepare("UPDATE tickets SET csat_score=?, csat_comment=? WHERE id=? AND requester_id=? AND status='RESOLVIDO' AND csat_score IS NULL")
        .run(parsed.data.csatScore, parsed.data.csatComment || null, id, currentUser.id);
    }
  });
  update();
  logAudit(db, { organizationId: ticket.organization_id, branchId: ticket.branch_id, actorId: currentUser.id, actorName: currentUser.name, entityType: "ticket", entityId: id, action: "UPDATE", details: JSON.stringify(parsed.data) });
  runEscalationCheck(db, id, ticket.organization_id);
  if (parsed.data.status === "RESOLVIDO" && ticket.status !== "RESOLVIDO") {
    dispatchWebhooks(db, ticket.organization_id, "TICKET_RESOLVED", {
      id,
      number: ticket.number,
      title: ticket.title,
      status: "RESOLVIDO",
      assigneeId: ticket.assignee_id,
      requesterId: ticket.requester_id,
    });
  }
  if (parsed.data.assume || (parsed.data.assigneeId !== undefined && parsed.data.assigneeId !== ticket.assignee_id && parsed.data.assigneeId)) {
    const assigneeId = parsed.data.assume ? currentUser.id : parsed.data.assigneeId;
    dispatchWebhooks(db, ticket.organization_id, "TICKET_ASSIGNED", {
      id,
      number: ticket.number,
      title: ticket.title,
      assigneeId,
      previousAssigneeId: ticket.assignee_id,
    });
  }
  return Response.json({ ok: true });
}
