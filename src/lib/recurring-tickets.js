import { makeId } from "@/lib/db";
import { computeSlaDueAt, computeResolutionDueAt, getSlaStatus, parseSlaPolicy } from "@/lib/sla";
import { getTicketStatusMeta } from "@/lib/ticket-statuses";
import { createNotification } from "@/lib/notifications";
import { runAutomationRules } from "@/lib/automation";
import { dispatchWebhooks } from "@/lib/webhooks";
import { logAudit } from "@/lib/audit";

export const RECURRENCE_UNIT_LABELS = { DAYS: "dia(s)", WEEKS: "semana(s)", MONTHS: "mês(es)" };

export function advanceDate(iso, unit, interval) {
  const date = new Date(iso);
  const n = Math.max(1, Number(interval) || 1);
  if (unit === "DAYS") date.setDate(date.getDate() + n);
  else if (unit === "WEEKS") date.setDate(date.getDate() + n * 7);
  else date.setMonth(date.getMonth() + n); // MONTHS (padrão)
  return date.toISOString();
}

// Abre um chamado a partir de um modelo recorrente — mesmo caminho de um chamado criado
// pelo portal (automação, notificação, webhook, auditoria), sem requerente nem aprovação.
function createTicketFromTemplate(db, template) {
  const ticketType = db.prepare("SELECT * FROM ticket_types WHERE id=? AND organization_id=? AND active=1")
    .get(template.ticket_type_id, template.organization_id);
  if (!ticketType) return null; // tipo desativado/excluído: não cria, mas o agendamento é avançado mesmo assim

  const now = new Date().toISOString();
  const id = makeId("tkt");
  const number = db.prepare("SELECT COALESCE(MAX(number), 1000)+1 AS next FROM tickets").get().next;
  const priority = template.priority || ticketType.default_priority || "MEDIA";
  const settings = db.prepare("SELECT sla_hours, sla_policy_json FROM system_settings WHERE organization_id=?").get(template.organization_id);
  const slaPolicy = parseSlaPolicy(settings?.sla_policy_json);
  const slaDueAt = computeResolutionDueAt(slaPolicy, priority) || computeSlaDueAt(settings?.sla_hours || 8, priority);
  const statusMeta = getTicketStatusMeta(db, template.organization_id, "ABERTO");
  const slaStatus = getSlaStatus(slaDueAt, "ABERTO", { pausesSla: statusMeta?.pauses_sla, isTerminal: statusMeta?.is_terminal });
  const team = template.team_id
    ? db.prepare("SELECT id FROM teams WHERE id=? AND organization_id=?").get(template.team_id, template.organization_id)
    : null;

  db.prepare(`INSERT INTO tickets
    (id, number, organization_id, branch_id, origin_branch_id, requester_id, assignee_id, title, description, category, kind, priority, status, source, created_at, updated_at, ticket_type_id, team_id, sla_due_at, sla_status)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'ABERTO', 'RECURRING', ?, ?, ?, ?, ?, ?)`)
    .run(id, number, template.organization_id, template.branch_id, template.branch_id, template.assignee_id || null,
      template.title, template.description, ticketType.category, ticketType.kind, priority, now, now, ticketType.id, team?.id || null, slaDueAt, slaStatus);
  db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'CREATED', ?, ?)")
    .run(makeId("evt"), id, null, "Chamado recorrente", `Chamado gerado automaticamente pelo modelo "${template.title}".`, now);

  runAutomationRules(db, id, template.organization_id);
  logAudit(db, {
    organizationId: template.organization_id, branchId: template.branch_id, actorId: null, actorName: "Chamado recorrente",
    entityType: "ticket", entityId: id, action: "CREATE", details: `#${number} ${template.title} (recorrente)`,
  });
  if (template.assignee_id) {
    createNotification(db, { organizationId: template.organization_id, userId: template.assignee_id, eventType: "TICKET_NEW", title: `Novo chamado #${number}`, body: template.title, referenceId: id, referenceType: "TICKET" });
  } else if (team?.id) {
    const members = db.prepare("SELECT user_id FROM team_members WHERE team_id=?").all(team.id);
    members.forEach((member) => createNotification(db, { organizationId: template.organization_id, userId: member.user_id, eventType: "TICKET_NEW", title: `Novo chamado #${number}`, body: template.title, referenceId: id, referenceType: "TICKET" }));
  }
  dispatchWebhooks(db, template.organization_id, "TICKET_NEW", {
    id, number, title: template.title, status: "ABERTO", priority,
    branchId: template.branch_id, originBranchId: template.branch_id, requesterId: null, ticketTypeId: ticketType.id,
  });

  return { id, number };
}

// Roda a cada tick do agendador (ver src/lib/recurring-ticket-scheduler.js): para cada
// modelo ativo vencido, abre UM chamado — mesmo que tenha ficado várias janelas atrasado
// (servidor fora do ar, por exemplo) — e avança next_run_at até a próxima ocorrência futura,
// para não gerar uma rajada de chamados cobrindo o tempo perdido.
export function runRecurringTicketsCheck(db) {
  const now = new Date().toISOString();
  const due = db.prepare("SELECT * FROM recurring_tickets WHERE active=1 AND next_run_at<=?").all(now);
  for (const template of due) {
    try {
      const created = createTicketFromTemplate(db, template);
      let next = advanceDate(template.next_run_at, template.recurrence_unit, template.recurrence_interval);
      let guard = 0;
      while (next <= now && guard < 1000) {
        next = advanceDate(next, template.recurrence_unit, template.recurrence_interval);
        guard++;
      }
      db.prepare("UPDATE recurring_tickets SET next_run_at=?, last_run_at=?, last_ticket_id=COALESCE(?, last_ticket_id) WHERE id=?")
        .run(next, now, created?.id || null, template.id);
    } catch {
      // Falha num modelo (ex.: tipo de chamado removido) não deve travar os demais.
    }
  }
}
