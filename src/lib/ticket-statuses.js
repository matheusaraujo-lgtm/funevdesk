const DEFAULT_STATUSES = [
  { code: "ABERTO", label: "Aberto", sort_order: 0, is_terminal: 0, pauses_sla: 0, allows_messages: 1, color: "green" },
  { code: "EM_ATENDIMENTO", label: "Em atendimento", sort_order: 1, is_terminal: 0, pauses_sla: 0, allows_messages: 1, color: "blue" },
  { code: "PENDENTE", label: "Pendente", sort_order: 2, is_terminal: 0, pauses_sla: 1, allows_messages: 1, color: "amber" },
  { code: "RESOLVIDO", label: "Resolvido", sort_order: 3, is_terminal: 1, pauses_sla: 0, allows_messages: 0, color: "gray" },
  { code: "CANCELADO", label: "Cancelado", sort_order: 4, is_terminal: 1, pauses_sla: 0, allows_messages: 0, color: "gray" },
];

export const CANCEL_STATUS_CODE = "CANCELADO";

export function seedTicketStatuses(db, organizationId) {
  const count = db.prepare("SELECT COUNT(*) total FROM ticket_statuses WHERE organization_id=?").get(organizationId).total;
  if (count > 0) return;
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO ticket_statuses
      (id, organization_id, code, label, sort_order, is_terminal, pauses_sla, allows_messages, color, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  for (const row of DEFAULT_STATUSES) {
    insert.run(
      `sts_${row.code.toLowerCase()}_${organizationId.slice(0, 8)}`,
      organizationId,
      row.code,
      row.label,
      row.sort_order,
      row.is_terminal,
      row.pauses_sla,
      row.allows_messages,
      row.color,
      now,
    );
  }
}

// Garante que o status "Cancelado" exista mesmo em organizações já semeadas antes
// dele entrar no seed padrão (o seed só roda quando a tabela está vazia).
export function ensureCancelStatus(db, organizationId) {
  seedTicketStatuses(db, organizationId);
  const existing = db.prepare("SELECT code FROM ticket_statuses WHERE organization_id=? AND code=?").get(organizationId, CANCEL_STATUS_CODE);
  if (existing) return CANCEL_STATUS_CODE;
  db.prepare(`
    INSERT INTO ticket_statuses
      (id, organization_id, code, label, sort_order, is_terminal, pauses_sla, allows_messages, color, active, created_at)
    VALUES (?, ?, 'CANCELADO', 'Cancelado', 4, 1, 0, 0, 'gray', 1, ?)
  `).run(`sts_cancelado_${organizationId.slice(0, 8)}`, organizationId, new Date().toISOString());
  return CANCEL_STATUS_CODE;
}

export function listTicketStatuses(db, organizationId) {
  seedTicketStatuses(db, organizationId);
  return db.prepare(`
    SELECT id, code, label, sort_order, is_terminal, pauses_sla, allows_messages, color, active
    FROM ticket_statuses
    WHERE organization_id=? AND active=1
    ORDER BY sort_order, label
  `).all(organizationId).map((row) => ({
    ...row,
    is_terminal: Boolean(row.is_terminal),
    pauses_sla: Boolean(row.pauses_sla),
    allows_messages: Boolean(row.allows_messages),
    active: Boolean(row.active),
  }));
}

export function getTicketStatusMeta(db, organizationId, code) {
  if (!code) return null;
  seedTicketStatuses(db, organizationId);
  const row = db.prepare(`
    SELECT code, label, is_terminal, pauses_sla, allows_messages
    FROM ticket_statuses WHERE organization_id=? AND code=? AND active=1
  `).get(organizationId, code);
  if (!row) return null;
  return {
    code: row.code,
    label: row.label,
    is_terminal: Boolean(row.is_terminal),
    pauses_sla: Boolean(row.pauses_sla),
    allows_messages: Boolean(row.allows_messages),
  };
}

export function isResolvedStatus(meta, statusCode) {
  return meta?.is_terminal || statusCode === "RESOLVIDO";
}

export function statusAllowsMessages(meta, statusCode) {
  if (!meta) return statusCode !== "RESOLVIDO";
  return meta.allows_messages;
}

export function isTerminalStatusCode(db, organizationId, code) {
  const meta = getTicketStatusMeta(db, organizationId, code);
  return isResolvedStatus(meta, code);
}

export function getTerminalStatusCode(db, organizationId) {
  const statuses = listTicketStatuses(db, organizationId);
  const terminal = statuses.find((row) => row.is_terminal);
  return terminal?.code || "RESOLVIDO";
}

export function isActiveTicketStatus(db, organizationId, code) {
  return !isTerminalStatusCode(db, organizationId, code);
}
