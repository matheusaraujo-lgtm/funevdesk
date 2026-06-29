import { requireCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { getDb, makeId } from "@/lib/db";
import { computeSlaDueAt, getSlaStatus, parseSlaPolicy, computeResolutionDueAt, computeFirstResponseDueAt } from "@/lib/sla";
import { getTicketStatusMeta } from "@/lib/ticket-statuses";
import { runEscalationCheck } from "@/lib/escalation";
import { runAutomationRules } from "@/lib/automation";
import { dispatchWebhooks } from "@/lib/webhooks";
import { isTicketTypeAvailableForBranch, resolveHandlingBranchId } from "@/lib/ticket-type-routing";
import { z } from "zod";

const schema = z.object({
  branchId: z.string().min(1),
  locationId: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(),
  ticketTypeId: z.string().min(1),
  title: z.string().min(5).max(160),
  description: z.string().min(5).max(5000),
  answers: z.array(z.object({
    fieldId: z.string().min(1),
    value: z.string().max(5000),
  })).default([]),
  attachments: z.array(z.object({
    fieldId: z.string().optional(),
    fieldLabel: z.string().optional(),
    originalName: z.string().min(1),
    storedName: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
    publicUrl: z.string().startsWith("/uploads/"),
    attachmentType: z.enum(["FILE", "SCREENSHOT"]),
  })).default([]),
  approverId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
  term: z.object({
    signerName: z.string().min(3).max(160),
    signerDocument: z.string().max(80).optional().default(""),
    signatureText: z.string().min(3).max(240),
  }).optional().nullable(),
});

export async function POST(request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const ticketType = db.prepare("SELECT * FROM ticket_types WHERE id=? AND organization_id=? AND active=1").get(parsed.data.ticketTypeId, currentUser.organization_id);
  if (!ticketType) return Response.json({ error: "Tipo de chamado não encontrado ou inativo." }, { status: 404 });
  const configuredFields = db.prepare("SELECT * FROM ticket_fields WHERE ticket_type_id=? ORDER BY position").all(ticketType.id);
  const answerMap = new Map(parsed.data.answers.map((answer) => [answer.fieldId, answer.value]));
  const attachmentFields = new Set(parsed.data.attachments.map((attachment) => attachment.fieldId));
  for (const field of configuredFields) {
    if (!field.required) continue;
    const hasValue = Boolean(answerMap.get(field.id)?.trim());
    const hasFile = attachmentFields.has(field.id);
    if (!hasValue && !hasFile) return Response.json({ error: `O campo "${field.label}" é obrigatório.` }, { status: 400 });
  }
  const branchId = parsed.data.branchId;
  if (currentUser.role !== "ADMIN" && !currentUser.branchIds.includes(branchId)) {
    return Response.json({ error: "Você não possui permissão para abrir chamados nesta unidade." }, { status: 403 });
  }
  const branch = db.prepare("SELECT id, organization_id, name FROM branches WHERE id=? AND organization_id=?").get(branchId, currentUser.organization_id);
  if (!branch) return Response.json({ error: "Unidade não encontrada." }, { status: 404 });
  const typeBranchLinks = db.prepare("SELECT ticket_type_id, branch_id FROM ticket_type_branches WHERE ticket_type_id=?").all(ticketType.id);
  if (!isTicketTypeAvailableForBranch(ticketType, branchId, typeBranchLinks)) {
    return Response.json({ error: "Este tipo de chamado não está disponível para a unidade selecionada." }, { status: 403 });
  }
  const originBranchId = branchId;
  const handlingBranchId = resolveHandlingBranchId(db, ticketType, originBranchId, branch.organization_id);
  const handlingBranch = db.prepare("SELECT id, name FROM branches WHERE id=?").get(handlingBranchId);
  // Prioriza o equipamento detectado/enviado no formulário (auto-detecção pelo agente local).
  // Só cai para o asset fixo do colaborador quando nada foi detectado. A validação abaixo
  // garante que o ativo pertence à organização e à unidade do chamado.
  let assetId = parsed.data.assetId || null;
  if (!assetId && currentUser.role === "EMPLOYEE") assetId = currentUser.asset_id || null;
  if (assetId) {
    const asset = db.prepare("SELECT branch_id FROM assets WHERE id=? AND organization_id=?").get(assetId, currentUser.organization_id);
    if (!asset || asset.branch_id !== branchId) return Response.json({ error: "O equipamento não pertence à unidade selecionada." }, { status: 403 });
  }
  const number = db.prepare("SELECT COALESCE(MAX(number), 1000)+1 AS next FROM tickets").get().next;
  const now = new Date().toISOString();
  const id = makeId("tkt");
  const settings = db.prepare("SELECT sla_hours, sla_policy_json FROM system_settings WHERE organization_id=?").get(branch.organization_id);
  const service = parsed.data.serviceId
    ? db.prepare("SELECT * FROM services WHERE id=? AND organization_id=? AND active=1").get(parsed.data.serviceId, currentUser.organization_id)
    : db.prepare("SELECT * FROM services WHERE ticket_type_id=? AND organization_id=? AND active=1 LIMIT 1").get(ticketType.id, currentUser.organization_id);
  const slaPolicy = parseSlaPolicy(settings?.sla_policy_json);
  const priority = ticketType.default_priority;
  // Resolução: SLA do serviço (legado) tem prioridade; senão usa a política por prioridade.
  const slaDueAt = service?.sla_hours
    ? computeSlaDueAt(service.sla_hours, priority)
    : computeResolutionDueAt(slaPolicy, priority);
  const team = db.prepare("SELECT id FROM teams WHERE branch_id=? AND organization_id=? ORDER BY created_at LIMIT 1").get(handlingBranchId, branch.organization_id);

  let approverId = null;
  if (ticketType.requires_approval) {
    if (ticketType.approval_mode === "FIXED") {
      approverId = ticketType.default_approver_id;
    } else if (ticketType.approval_mode === "SELECT") {
      approverId = parsed.data.approverId;
      if (!approverId) return Response.json({ error: "Este tipo de chamado exige seleção de aprovador." }, { status: 400 });
    }
    if (!approverId) return Response.json({ error: "Aprovador não configurado para este tipo de chamado." }, { status: 400 });
  } else if (parsed.data.approverId) {
    approverId = parsed.data.approverId;
  }

  if (ticketType.requires_term && !assetId) {
    return Response.json({ error: "Este tipo exige um equipamento vinculado para o termo." }, { status: 400 });
  }

  let ticketLocationId = parsed.data.locationId || null;
  for (const field of configuredFields) {
    if (field.field_type !== "LOCATION") continue;
    const value = answerMap.get(field.id)?.trim();
    if (value) ticketLocationId = value;
  }

  const initialStatus = approverId ? "PENDENTE" : "ABERTO";
  const initialStatusMeta = getTicketStatusMeta(db, branch.organization_id, initialStatus);
  const slaStatus = getSlaStatus(slaDueAt, initialStatus, {
    pausesSla: initialStatusMeta?.pauses_sla,
    isTerminal: initialStatusMeta?.is_terminal,
  });
  const slaPausedAt = initialStatusMeta?.pauses_sla ? now : null;
  // Relógio de 1ª resposta só inicia quando o chamado entra na fila (não enquanto aguarda aprovação).
  const firstResponseDueAt = initialStatus === "PENDENTE" ? null : computeFirstResponseDueAt(slaPolicy, priority);

  const create = db.transaction(() => {
    db.prepare(`INSERT INTO tickets
      (id, number, organization_id, branch_id, origin_branch_id, asset_id, requester_id, title, description, category, kind, priority, status, source, created_at, updated_at, ticket_type_id, service_id, team_id, sla_due_at, sla_status, sla_paused_at, first_response_due_at, location_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PORTAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, number, branch.organization_id, handlingBranchId, originBranchId, assetId, currentUser.id, parsed.data.title, parsed.data.description, ticketType.category, ticketType.kind, ticketType.default_priority, initialStatus, now, now, ticketType.id, service?.id || null, team?.id || null, slaDueAt, slaStatus, slaPausedAt, firstResponseDueAt, ticketLocationId);
    const insertResponse = db.prepare(`INSERT INTO ticket_responses
      (id, ticket_id, field_id, field_label, field_type, value_text)
      VALUES (?, ?, ?, ?, ?, ?)`);
    for (const field of configuredFields) {
      if (["FILE", "SCREENSHOT"].includes(field.field_type)) continue;
      const value = answerMap.get(field.id);
      if (value && field.field_type !== "LOCATION") {
        insertResponse.run(makeId("rsp"), id, field.id, field.label, field.field_type, value);
      }
    }
    const insertAttachment = db.prepare(`INSERT INTO attachments
      (id, ticket_id, original_name, stored_name, mime_type, size_bytes, public_url, attachment_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const attachment of parsed.data.attachments) {
      insertAttachment.run(makeId("att"), id, attachment.originalName, attachment.storedName, attachment.mimeType, attachment.sizeBytes, attachment.publicUrl, attachment.attachmentType, now);
      if (attachment.fieldLabel) insertResponse.run(makeId("rsp"), id, attachment.fieldId || null, attachment.fieldLabel, attachment.attachmentType, attachment.originalName);
    }
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'CREATED', ?, ?)")
      .run(makeId("evt"), id, currentUser.id, currentUser.name, "Chamado criado pelo portal.", now);
    if (handlingBranchId !== originBranchId && handlingBranch?.name) {
      db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'ROUTED', ?, ?)")
        .run(makeId("evt"), id, currentUser.id, currentUser.name, `Chamado encaminhado para a fila de ${handlingBranch.name}.`, now);
    }
    if (approverId) {
      const approver = db.prepare("SELECT id, name FROM users WHERE id=? AND organization_id=? AND active=1").get(approverId, currentUser.organization_id);
      if (approver) {
        db.prepare("INSERT INTO ticket_approvals (id, ticket_id, approver_id, status, requested_at) VALUES (?, ?, ?, 'PENDENTE', ?)")
          .run(makeId("apv"), id, approver.id, now);
        db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'APPROVAL_REQUESTED', ?, ?)")
          .run(makeId("evt"), id, currentUser.id, currentUser.name, `Aprovação solicitada para ${approver.name}.`, now);
        createNotification(db, { organizationId: branch.organization_id, userId: approver.id, eventType: "TICKET_APPROVAL", title: `Aprovação · Chamado #${number}`, body: parsed.data.title, referenceId: id, referenceType: "TICKET" });
      }
    }
    // A baixa de estoque NÃO ocorre na abertura: o técnico confirma a saída ao resolver o chamado.
    if (initialStatus === "PENDENTE") {
      db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'STATUS_CHANGED', ?, ?)")
        .run(makeId("evt"), id, currentUser.id, currentUser.name, "Chamado aguardando aprovação (SLA pausado).", now);
    }
    if (parsed.data.term && assetId && ticketType.requires_term) {
      const termId = makeId("term");
      const fileName = `${termId}.pdf`;
      db.prepare(`INSERT INTO equipment_terms
        (id, organization_id, branch_id, asset_id, user_id, ticket_id, term_template_id, signer_name, signer_document, signature_text, pdf_name, pdf_url, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ASSINADO', ?)`)
        .run(termId, branch.organization_id, branchId, assetId, currentUser.id, id, ticketType.term_template_id || null,
          parsed.data.term.signerName, parsed.data.term.signerDocument || null, parsed.data.term.signatureText,
          fileName, `/api/terms/${termId}/pdf`, now);
      db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'TERM_SIGNED', ?, ?)")
        .run(makeId("evt"), id, currentUser.id, currentUser.name, "Termo de equipamento assinado no chamado.", now);
    }
  });
  create();
  // Regras de automação: roteamento (equipe/responsável) por prioridade, tipo, categoria.
  runAutomationRules(db, id, branch.organization_id);
  logAudit(db, { organizationId: branch.organization_id, branchId: handlingBranchId, actorId: currentUser.id, actorName: currentUser.name, entityType: "ticket", entityId: id, action: "CREATE", details: `#${number} ${parsed.data.title}` });
  if (team?.id) {
    const members = db.prepare("SELECT user_id FROM team_members WHERE team_id=?").all(team.id);
    members.forEach((m) => createNotification(db, { organizationId: branch.organization_id, userId: m.user_id, eventType: "TICKET_NEW", title: `Novo chamado #${number}`, body: parsed.data.title, referenceId: id, referenceType: "TICKET" }));
  }
  runEscalationCheck(db, id, branch.organization_id);
  dispatchWebhooks(db, branch.organization_id, "TICKET_NEW", {
    id,
    number,
    title: parsed.data.title,
    status: "ABERTO",
    priority: ticketType.default_priority,
    branchId: handlingBranchId,
    originBranchId,
    requesterId: currentUser.id,
    ticketTypeId: ticketType.id,
  });
  return Response.json({ id, number }, { status: 201 });
}
