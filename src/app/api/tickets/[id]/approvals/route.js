import { canAccessTicket, getPermissions, requireCurrentUser } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { getDb, makeId } from "@/lib/db";
import { extendSlaAfterPause, getSlaStatus } from "@/lib/sla";
import { getTicketStatusMeta } from "@/lib/ticket-statuses";
import { z } from "zod";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  approverId: z.string().min(1),
});

const decisionSchema = z.object({
  approvalId: z.string().min(1),
  status: z.enum(["APROVADO", "REPROVADO"]),
  comment: z.string().max(1000).optional().default(""),
});

function loadTicket(db, id) {
  return db.prepare("SELECT * FROM tickets WHERE id=?").get(id);
}

export async function POST(request, { params }) {
  const { id } = await params;
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Aprovador inválido." }, { status: 400 });
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const ticket = loadTicket(db, id);
  if (!ticket) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });
  if (!canAccessTicket(currentUser, ticket)) return Response.json({ error: "Acesso negado." }, { status: 403 });
  if (!getPermissions(currentUser).canManageTickets) return Response.json({ error: "Seu perfil não pode solicitar aprovação." }, { status: 403 });
  const approver = db.prepare("SELECT id, name FROM users WHERE id=? AND organization_id=? AND active=1").get(parsed.data.approverId, currentUser.organization_id);
  if (!approver) return Response.json({ error: "Usuário aprovador não encontrado." }, { status: 404 });
  const now = new Date().toISOString();
  const approvalId = makeId("apv");
  const create = db.transaction(() => {
    db.prepare("INSERT INTO ticket_approvals (id, ticket_id, approver_id, status, requested_at) VALUES (?, ?, ?, 'PENDENTE', ?)")
      .run(approvalId, id, approver.id, now);
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'APPROVAL_REQUESTED', ?, ?)")
      .run(makeId("evt"), id, currentUser.id, currentUser.name, `Aprovação solicitada para ${approver.name}.`, now);
    createNotification(db, { organizationId: ticket.organization_id, userId: approver.id, eventType: "TICKET_APPROVAL", title: `Aprovação · Chamado #${ticket.number || id}`, body: ticket.title || "Chamado", referenceId: id, referenceType: "TICKET" });
  });
  create();
  return Response.json({ id: approvalId }, { status: 201 });
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const parsed = decisionSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Decisão inválida." }, { status: 400 });
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const ticket = loadTicket(db, id);
  if (!ticket) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });
  // Garante escopo de organização/filial antes de qualquer decisão (evita IDOR entre filiais).
  if (!canAccessTicket(currentUser, ticket)) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const approval = db.prepare(`
    SELECT ta.*, t.organization_id, t.id ticket_id
    FROM ticket_approvals ta JOIN tickets t ON t.id=ta.ticket_id
    WHERE ta.id=? AND ta.ticket_id=?
  `).get(parsed.data.approvalId, id);
  if (!approval) return Response.json({ error: "Aprovação não encontrada." }, { status: 404 });
  const canDecide = approval.approver_id === currentUser.id || getPermissions(currentUser).canManageTickets;
  if (!canDecide) return Response.json({ error: "Você não pode decidir esta aprovação." }, { status: 403 });
  const now = new Date().toISOString();
  const decide = db.transaction(() => {
    db.prepare("UPDATE ticket_approvals SET status=?, decided_at=?, comment=? WHERE id=?")
      .run(parsed.data.status, now, parsed.data.comment || null, approval.id);
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'APPROVAL_DECIDED', ?, ?)")
      .run(makeId("evt"), id, currentUser.id, currentUser.name, `Aprovação ${parsed.data.status.toLowerCase()}. ${parsed.data.comment || ""}`.trim(), now);
    if (parsed.data.status === "APROVADO") {
      const ticket = db.prepare("SELECT requester_id, organization_id, number, title, status, sla_due_at, sla_paused_at FROM tickets WHERE id=?").get(id);
      if (ticket?.status === "PENDENTE") {
        const oldMeta = getTicketStatusMeta(db, ticket.organization_id, "PENDENTE");
        const newMeta = getTicketStatusMeta(db, ticket.organization_id, "ABERTO");
        let slaDueAt = ticket.sla_due_at;
        let slaPausedAt = ticket.sla_paused_at;
        if (oldMeta?.pauses_sla && !newMeta?.pauses_sla && slaPausedAt) {
          slaDueAt = extendSlaAfterPause(slaDueAt, slaPausedAt);
          slaPausedAt = null;
        }
        const slaStatus = getSlaStatus(slaDueAt, "ABERTO", { pausesSla: newMeta?.pauses_sla, isTerminal: newMeta?.is_terminal });
        db.prepare("UPDATE tickets SET status='ABERTO', updated_at=?, sla_due_at=?, sla_paused_at=?, sla_status=? WHERE id=?")
          .run(now, slaDueAt, slaPausedAt, slaStatus, id);
        db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'STATUS_CHANGED', ?, ?)")
          .run(makeId("evt"), id, currentUser.id, currentUser.name, "Chamado liberado após aprovação (SLA retomado).", now);
      }
      if (ticket?.requester_id) {
        createNotification(db, {
          organizationId: ticket.organization_id,
          userId: ticket.requester_id,
          eventType: "TICKET_APPROVAL",
          title: `Chamado aprovado · #${ticket.number}`,
          body: ticket.title,
          referenceId: id,
          referenceType: "TICKET",
        });
      }
    } else {
      const ticket = db.prepare("SELECT requester_id, organization_id, number, title FROM tickets WHERE id=?").get(id);
      if (ticket?.requester_id) {
        createNotification(db, {
          organizationId: ticket.organization_id,
          userId: ticket.requester_id,
          eventType: "TICKET_APPROVAL",
          title: `Chamado reprovado · #${ticket.number}`,
          body: ticket.title,
          referenceId: id,
          referenceType: "TICKET",
        });
      }
    }
  });
  decide();
  return Response.json({ ok: true });
}
