import { makeId } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

// Avalia as regras de automação ativas contra um chamado recém-criado e aplica
// as ações da PRIMEIRA regra que casar (roteamento determinístico, sem encadeamento).
// É best-effort: nunca lança — falha de regra não bloqueia a criação do chamado.
export function runAutomationRules(db, ticketId, organizationId) {
  try {
    const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(ticketId);
    if (!ticket) return null;
    const rules = db.prepare(
      "SELECT * FROM automation_rules WHERE organization_id=? AND active=1 ORDER BY position, created_at"
    ).all(organizationId);
    for (const rule of rules) {
      let conditions = {};
      let actions = {};
      try {
        conditions = JSON.parse(rule.conditions_json || "{}");
        actions = JSON.parse(rule.actions_json || "{}");
      } catch { continue; }
      if (!matchesConditions(ticket, conditions)) continue;
      const applied = applyActions(db, ticket, actions, rule);
      if (applied) return rule.name;
    }
  } catch {
    // Silencioso por design: automação é um enriquecimento, não pode quebrar a abertura.
  }
  return null;
}

function matchesConditions(ticket, c) {
  if (c.priority && ticket.priority !== c.priority) return false;
  if (c.category && ticket.category !== c.category) return false;
  if (c.ticketTypeId && ticket.ticket_type_id !== c.ticketTypeId) return false;
  if (c.kind && ticket.kind !== c.kind) return false;
  return true;
}

function applyActions(db, ticket, actions, rule) {
  const now = new Date().toISOString();
  const sets = [];
  const params = [];
  let assigneeId = null;

  if (actions.teamId) {
    const team = db.prepare("SELECT id FROM teams WHERE id=? AND organization_id=?").get(actions.teamId, ticket.organization_id);
    if (team) { sets.push("team_id=?"); params.push(team.id); }
  }
  if (actions.assigneeId) {
    const user = db.prepare("SELECT id FROM users WHERE id=? AND organization_id=? AND active=1").get(actions.assigneeId, ticket.organization_id);
    if (user) { assigneeId = user.id; sets.push("assignee_id=?"); params.push(user.id); }
  }
  if (!sets.length) return false;

  sets.push("updated_at=?");
  params.push(now, ticket.id);
  db.prepare(`UPDATE tickets SET ${sets.join(", ")} WHERE id=?`).run(...params);
  db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'AUTOMATION', ?, ?)")
    .run(makeId("evt"), ticket.id, null, "Automação", `Regra "${rule.name}" aplicada automaticamente.`, now);
  if (assigneeId) {
    createNotification(db, {
      organizationId: ticket.organization_id,
      userId: assigneeId,
      eventType: "TICKET_ASSIGNED",
      title: `Chamado #${ticket.number} atribuído`,
      body: ticket.title,
      referenceId: ticket.id,
      referenceType: "TICKET",
    });
  }
  return true;
}
