import { makeId } from "@/lib/db";
import { extendSlaAfterPause, getSlaStatus } from "@/lib/sla";
import { getTicketStatusMeta, listTicketStatuses } from "@/lib/ticket-statuses";
import { createNotification } from "@/lib/notifications";

// Duração legível para o evento de "retomado após X em pendência" (nível de gestão).
export function formatPendingDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes ? `${hours}h ${remMinutes}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

// Reabertura automática (estilo GLPI "follow-up"): chamados numa situação que exige motivo
// (ex.: Pendente) com data de reabertura vencida voltam sozinhos à situação anterior —
// mesmo que ninguém tenha mexido neles. Chamado por src/lib/pending-ticket-scheduler.js.
export function reopenDuePendingTickets(db) {
  const now = new Date().toISOString();
  const due = db.prepare("SELECT * FROM tickets WHERE pending_reopen_at IS NOT NULL AND pending_reopen_at<=?").all(now);
  for (const ticket of due) {
    try {
      const statusList = listTicketStatuses(db, ticket.organization_id);
      const oldMeta = getTicketStatusMeta(db, ticket.organization_id, ticket.status);
      if (!oldMeta?.requires_reason) {
        // Já saiu da pendência manualmente nesse meio-tempo — só limpa o agendamento.
        db.prepare("UPDATE tickets SET pending_reopen_at=NULL, status_before_pending=NULL WHERE id=?").run(ticket.id);
        continue;
      }

      const fallbackCode = statusList.find((s) => !s.is_terminal && !s.requires_reason)?.code;
      const targetCode = (ticket.status_before_pending && statusList.some((s) => s.code === ticket.status_before_pending && !s.requires_reason))
        ? ticket.status_before_pending
        : fallbackCode;
      const newMeta = targetCode ? statusList.find((s) => s.code === targetCode) : null;
      if (!newMeta) continue; // sem situação de destino válida — não há para onde reabrir

      let slaDueAt = ticket.sla_due_at;
      let slaPausedAt = ticket.sla_paused_at;
      if (oldMeta.pauses_sla && !newMeta.pauses_sla && slaPausedAt) {
        slaDueAt = extendSlaAfterPause(slaDueAt, slaPausedAt);
        slaPausedAt = null;
      }
      const slaStatus = getSlaStatus(slaDueAt, targetCode, { pausesSla: newMeta.pauses_sla, isTerminal: newMeta.is_terminal });

      let description = `Situação alterada para ${newMeta.label} automaticamente (data de reabertura atingida).`;
      if (ticket.pending_since) {
        const duration = formatPendingDuration(new Date(now).getTime() - new Date(ticket.pending_since).getTime());
        description = `Situação alterada para ${newMeta.label} automaticamente após ${duration} em "${oldMeta.label}"${ticket.pending_reason ? ` (motivo: ${ticket.pending_reason})` : ""}.`;
      }

      db.prepare(`UPDATE tickets SET status=?, updated_at=?, sla_status=?, sla_due_at=?, sla_paused_at=?,
        pending_since=NULL, pending_reopen_at=NULL, status_before_pending=NULL WHERE id=?`)
        .run(targetCode, now, slaStatus, slaDueAt, slaPausedAt, ticket.id);
      db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'STATUS_CHANGED', ?, ?)")
        .run(makeId("evt"), ticket.id, null, "Reabertura automática", description, now);

      if (ticket.assignee_id) {
        createNotification(db, {
          organizationId: ticket.organization_id, userId: ticket.assignee_id, eventType: "TICKET_REOPENED",
          title: `Chamado #${ticket.number} reaberto automaticamente`, body: description,
          referenceId: ticket.id, referenceType: "TICKET",
        });
      }
    } catch {
      // Falha num chamado não deve travar a reabertura dos demais.
    }
  }
}
