import { makeId } from "@/lib/db";
import { computeSlaDueAt, getSlaStatus } from "@/lib/sla";
import { getTicketStatusMeta, isTerminalStatusCode } from "@/lib/ticket-statuses";
import { translateSupply } from "@/lib/printer-supplies";
import { resolvePrinterEvents } from "@/lib/printer-events";
import { explainPrinter } from "@/lib/intelligence";

// Monta descrição HTML de chamado a partir de um insight do motor de inteligência.
function insightToHtml(insight, device) {
  const where = device.ip_address ? ` (${device.ip_address})` : "";
  const acoes = insight.acoes?.length
    ? `<p><strong>✅ O que fazer</strong></p><ol>${insight.acoes.map((a) => `<li>${a}</li>`).join("")}</ol>`
    : "";
  return (
    `<p><strong>🔎 O que aconteceu</strong></p><p>${insight.resumo}</p>` +
    (insight.impacto ? `<p><strong>⚠️ Possível impacto</strong></p><p>${insight.impacto}</p>` : "") +
    acoes +
    `<p><strong>🖥️ Detalhes técnicos</strong></p><p>Impressora: ${device.name}${where}</p>` +
    `<p><em>Severidade: ${insight.severityLabel} · Gerado automaticamente pelo Motor de Inteligência do FunevDesk.</em></p>`
  );
}

/**
 * Avalia a configuração de chamado automático de uma impressora contra o resultado
 * da verificação e abre UM chamado por incidente (dedupe via auto_ticket_id) quando
 * a condição é atingida — ex.: toner abaixo do limite, ou impressora offline/erro.
 * Retorna o id do chamado criado, ou null.
 */
export function maybeOpenPrinterTicket(db, device, result) {
  if (!device.auto_ticket) return null;

  // Config global de quais eventos abrem chamado (system_settings.printer_alert_events).
  const events = resolvePrinterEvents(
    db.prepare("SELECT printer_alert_events FROM system_settings WHERE organization_id=?").get(device.organization_id)?.printer_alert_events,
  );
  const printer = result?.metrics?.printer || {};
  const supplies = printer.supplies || [];
  const threshold = Number(device.auto_ticket_toner) || 0;

  const lowSupply = (events.supplyLow && threshold > 0)
    ? [...supplies].filter((s) => Number(s.percent) <= threshold).sort((a, b) => a.percent - b.percent)[0]
    : null;
  const activeErrors = (printer.errors || []).filter((e) => events[e.key]);
  const offline = events.offline && result.status === "OFFLINE";
  const unreachable = events.unreachable && result.metrics?.snmpOk === false;

  let reason = null;
  let signal = null;
  let detail = "";
  if (lowSupply) {
    reason = `Suprimento baixo: ${translateSupply(lowSupply.name)} em ${lowSupply.percent}% (limite configurado: ${threshold}%).`;
    signal = "supplyLow";
    detail = `${translateSupply(lowSupply.name)} em ${lowSupply.percent}%`;
  } else if (offline) {
    reason = "Impressora sem resposta (offline).";
    signal = "offline";
  } else if (unreachable) {
    reason = result.lastError || "Sem comunicação SNMP com a impressora.";
    signal = "unreachable";
    detail = result.lastError || "";
  } else if (activeErrors.length) {
    reason = `Erro reportado pela impressora: ${activeErrors.map((e) => e.label).join(", ")}.`;
    signal = activeErrors.some((e) => e.key === "jammed") ? "jammed" : activeErrors[0].key;
    detail = activeErrors.map((e) => e.label).join(", ");
  }
  if (!reason) return null;

  // Dedupe: não duplica enquanto houver um chamado automático aberto para a impressora.
  if (device.auto_ticket_id) {
    const existing = db.prepare("SELECT id, status FROM tickets WHERE id=?").get(device.auto_ticket_id);
    if (existing && !isTerminalStatusCode(db, device.organization_id, existing.status)) return null;
  }

  const ticketType = device.auto_ticket_type_id
    ? db.prepare("SELECT * FROM ticket_types WHERE id=? AND organization_id=? AND active=1").get(device.auto_ticket_type_id, device.organization_id)
    : db.prepare("SELECT * FROM ticket_types WHERE organization_id=? AND active=1 ORDER BY created_at LIMIT 1").get(device.organization_id);
  if (!ticketType) return null;

  const now = new Date().toISOString();
  const ticketId = makeId("tkt");
  const number = db.prepare("SELECT COALESCE(MAX(number), 1000)+1 AS next FROM tickets").get().next;
  const priority = ticketType.default_priority || "MEDIA";
  const settings = db.prepare("SELECT sla_hours FROM system_settings WHERE organization_id=?").get(device.organization_id);
  const slaDueAt = computeSlaDueAt(settings?.sla_hours || 8, priority);
  const statusMeta = getTicketStatusMeta(db, device.organization_id, "ABERTO");
  const slaStatus = getSlaStatus(slaDueAt, "ABERTO", { pausesSla: statusMeta?.pauses_sla, isTerminal: statusMeta?.is_terminal });
  const team = db.prepare("SELECT id FROM teams WHERE branch_id=? AND organization_id=? ORDER BY created_at LIMIT 1").get(device.branch_id, device.organization_id);
  const insight = explainPrinter(signal, device, detail);
  const title = insight.titulo;
  const description = insightToHtml(insight, device);

  db.prepare(`INSERT INTO tickets
    (id, number, organization_id, branch_id, origin_branch_id, requester_id, title, description, category, kind, priority, status, source, created_at, updated_at, ticket_type_id, team_id, sla_due_at, sla_status)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'ABERTO', 'MONITOR', ?, ?, ?, ?, ?, ?)`)
    .run(ticketId, number, device.organization_id, device.branch_id, device.branch_id, title, description, ticketType.category, ticketType.kind, priority, now, now, ticketType.id, team?.id || null, slaDueAt, slaStatus);
  db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'CREATED', ?, ?)")
    .run(makeId("evt"), ticketId, null, "Monitoramento", `Chamado aberto automaticamente: ${reason}`, now);
  db.prepare("UPDATE network_devices SET auto_ticket_id=? WHERE id=?").run(ticketId, device.id);

  return ticketId;
}
