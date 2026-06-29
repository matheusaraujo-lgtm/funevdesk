import { getDb, makeId } from "@/lib/db";
import { computeSlaDueAt, getSlaStatus } from "@/lib/sla";
import { getTicketStatusMeta, isTerminalStatusCode } from "@/lib/ticket-statuses";
import { createNotification } from "@/lib/notifications";

export function listInventoryItems(db, organizationId, { branchId, activeOnly = true } = {}) {
  let query = `
    SELECT i.*, b.name branch_name
    FROM inventory_items i
    LEFT JOIN branches b ON b.id = i.branch_id
    WHERE i.organization_id=?
  `;
  const params = [organizationId];
  if (activeOnly) query += " AND i.active=1";
  if (branchId) {
    query += " AND (i.branch_id IS NULL OR i.branch_id=?)";
    params.push(branchId);
  }
  query += " ORDER BY i.category, i.name";
  return db.prepare(query).all(...params).map(mapInventoryItem);
}

export function mapInventoryItem(item) {
  return {
    ...item,
    active: Boolean(item.active),
    autoReorder: Boolean(item.auto_reorder),
    reorderTicketTypeId: item.reorder_ticket_type_id || null,
    reorderAssigneeId: item.reorder_assignee_id || null,
    reorderTicketId: item.reorder_ticket_id || null,
    lowStock: item.quantity <= item.min_quantity,
  };
}

function resolveReorderBranchId(db, item) {
  if (item.branch_id) return item.branch_id;
  const matriz = db.prepare("SELECT id FROM branches WHERE organization_id=? AND type='MATRIZ' ORDER BY created_at LIMIT 1").get(item.organization_id);
  if (matriz) return matriz.id;
  const any = db.prepare("SELECT id FROM branches WHERE organization_id=? ORDER BY created_at LIMIT 1").get(item.organization_id);
  return any?.id || null;
}

function resolveReorderTicketType(db, item) {
  const settings = db.prepare("SELECT reorder_ticket_type_id FROM system_settings WHERE organization_id=?").get(item.organization_id);
  const configuredId = item.reorder_ticket_type_id || settings?.reorder_ticket_type_id;
  if (configuredId) {
    const configured = db.prepare("SELECT * FROM ticket_types WHERE id=? AND organization_id=? AND active=1").get(configuredId, item.organization_id);
    if (configured) return configured;
  }
  return db.prepare("SELECT * FROM ticket_types WHERE organization_id=? AND active=1 ORDER BY created_at LIMIT 1").get(item.organization_id);
}

export function maybeCreateReorderTicket(db, itemId) {
  const item = db.prepare("SELECT * FROM inventory_items WHERE id=?").get(itemId);
  if (!item || !item.auto_reorder) return null;
  if (item.quantity > item.min_quantity) return null;

  if (item.reorder_ticket_id) {
    const existing = db.prepare("SELECT id, status FROM tickets WHERE id=?").get(item.reorder_ticket_id);
    if (existing && !isTerminalStatusCode(db, item.organization_id, existing.status)) return null;
  }

  const branchId = resolveReorderBranchId(db, item);
  if (!branchId) return null;
  const ticketType = resolveReorderTicketType(db, item);
  if (!ticketType) return null;

  const now = new Date().toISOString();
  const ticketId = makeId("tkt");
  const number = db.prepare("SELECT COALESCE(MAX(number), 1000)+1 AS next FROM tickets").get().next;
  const priority = ticketType.default_priority || "MEDIA";
  const settings = db.prepare("SELECT sla_hours FROM system_settings WHERE organization_id=?").get(item.organization_id);
  const slaDueAt = computeSlaDueAt(settings?.sla_hours || 8, priority);
  const statusMeta = getTicketStatusMeta(db, item.organization_id, "ABERTO");
  const slaStatus = getSlaStatus(slaDueAt, "ABERTO", { pausesSla: statusMeta?.pauses_sla, isTerminal: statusMeta?.is_terminal });
  const assigneeId = item.reorder_assignee_id || null;
  const team = db.prepare("SELECT id FROM teams WHERE branch_id=? AND organization_id=? ORDER BY created_at LIMIT 1").get(branchId, item.organization_id);
  const title = `Reposição de estoque: ${item.name}`;
  const description = `O item "${item.name}" atingiu o nível mínimo de estoque (${item.quantity}/${item.min_quantity} ${item.unit}). É necessária a reposição.`;

  db.prepare(`INSERT INTO tickets
    (id, number, organization_id, branch_id, origin_branch_id, requester_id, title, description, category, kind, priority, status, source, created_at, updated_at, ticket_type_id, assignee_id, team_id, sla_due_at, sla_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABERTO', 'STOCK', ?, ?, ?, ?, ?, ?, ?)`)
    .run(ticketId, number, item.organization_id, branchId, branchId, assigneeId, title, description, ticketType.category, ticketType.kind, priority, now, now, ticketType.id, assigneeId, team?.id || null, slaDueAt, slaStatus);
  db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'CREATED', ?, ?)")
    .run(makeId("evt"), ticketId, null, "Sistema", `Chamado de reposição aberto automaticamente para "${item.name}".`, now);
  db.prepare("UPDATE inventory_items SET reorder_ticket_id=?, updated_at=? WHERE id=?").run(ticketId, now, item.id);

  if (assigneeId) {
    createNotification(db, {
      organizationId: item.organization_id,
      userId: assigneeId,
      eventType: "TICKET_NEW",
      title: `Reposição de estoque · Chamado #${number}`,
      body: title,
      referenceId: ticketId,
      referenceType: "TICKET",
    });
  }
  return ticketId;
}

export function applyStockMovement(db, { itemId, ticketId, userId, quantity, movementType = "SAIDA", notes = "" }) {
  const item = db.prepare("SELECT * FROM inventory_items WHERE id=?").get(itemId);
  if (!item) throw new Error("Item de estoque não encontrado.");
  const delta = movementType === "ENTRADA" ? Math.abs(quantity) : -Math.abs(quantity);
  const nextQty = item.quantity + delta;
  if (nextQty < 0) throw new Error(`Estoque insuficiente para "${item.name}".`);
  const now = new Date().toISOString();
  db.prepare("UPDATE inventory_items SET quantity=?, updated_at=? WHERE id=?").run(nextQty, now, itemId);
  db.prepare(`INSERT INTO inventory_movements (id, item_id, ticket_id, user_id, quantity, movement_type, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(makeId("mov"), itemId, ticketId || null, userId || null, delta, movementType, notes || null, now);
  let reorderTicketId = null;
  if (delta < 0 && nextQty <= item.min_quantity) {
    try {
      reorderTicketId = maybeCreateReorderTicket(db, itemId);
    } catch {
      /* não bloquear a movimentação por falha na reposição automática */
    }
  }
  return { itemId, quantity: nextQty, reorderTicketId };
}

export function parseStockFieldValue(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.itemId) return parsed;
  } catch {
    /* legacy text */
  }
  return null;
}

export function processStockAnswers(db, { ticketId, userId, fields, answerMap }) {
  for (const field of fields) {
    if (field.field_type !== "STOCK") continue;
    const payload = parseStockFieldValue(answerMap.get(field.id));
    if (!payload?.deduct || !payload?.itemId) continue;
    const qty = Math.max(1, Number(payload.qty) || 1);
    applyStockMovement(db, {
      itemId: payload.itemId,
      ticketId,
      userId,
      quantity: qty,
      movementType: "SAIDA",
      notes: `Retirada via chamado · campo ${field.label}`,
    });
  }
}
