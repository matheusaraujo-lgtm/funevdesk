import { makeId } from "@/lib/db";
import { getSlaStatus } from "@/lib/sla";
import { getTicketStatusMeta } from "@/lib/ticket-statuses";

export function runEscalationCheck(db, ticketId, organizationId) {
  const ticket = db.prepare(`
    SELECT id, assignee_id, team_id, sla_due_at, created_at, status, priority
    FROM tickets WHERE id=? AND organization_id=?
  `).get(ticketId, organizationId);
  if (!ticket || ticket.assignee_id) return { escalated: false };

  const now = Date.now();
  const ageMs = now - new Date(ticket.created_at).getTime();
  const statusMeta = getTicketStatusMeta(db, organizationId, ticket.status);
  const slaStatus = getSlaStatus(ticket.sla_due_at, ticket.status, {
    pausesSla: statusMeta?.pauses_sla,
    isTerminal: statusMeta?.is_terminal,
  });
  const rules = db.prepare(`
    SELECT * FROM escalation_rules
    WHERE organization_id=? AND active=1
    ORDER BY position, wait_minutes
  `).all(organizationId);

  for (const rule of rules) {
    if (rule.priority && rule.priority !== ticket.priority) continue;
    const unassignedTrigger = rule.trigger_type === "UNASSIGNED" && ageMs >= rule.wait_minutes * 60 * 1000;
    const slaTrigger = rule.trigger_type === "SLA_BREACH" && slaStatus === "VIOLADO";
    if (!unassignedTrigger && !slaTrigger) continue;

    const updatedAt = new Date().toISOString();
    db.prepare("UPDATE tickets SET team_id=?, updated_at=? WHERE id=?").run(rule.team_id, updatedAt, ticketId);
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'ESCALATED', ?, ?)")
      .run(makeId("evt"), ticketId, null, "Sistema", "Chamado escalado automaticamente para a equipe de suporte.", updatedAt);
    return { escalated: true, teamId: rule.team_id, ruleId: rule.id };
  }

  return { escalated: false };
}
