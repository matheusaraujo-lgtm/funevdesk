import { can, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { applyStockMovement, mapInventoryItem } from "@/lib/inventory";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  sku: z.string().max(40).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  branchId: z.string().nullable().optional(),
  minQuantity: z.number().int().min(0).optional(),
  unit: z.string().max(20).optional(),
  active: z.boolean().optional(),
  autoReorder: z.boolean().optional(),
  reorderTicketTypeId: z.string().nullable().optional(),
  reorderAssigneeId: z.string().nullable().optional(),
});

const movementSchema = z.object({
  quantity: z.number().int().positive(),
  movementType: z.enum(["ENTRADA", "SAIDA", "AJUSTE"]).default("ENTRADA"),
  notes: z.string().max(500).optional().default(""),
});

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "inventory", "update")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const item = db.prepare("SELECT * FROM inventory_items WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!item) return Response.json({ error: "Item não encontrado." }, { status: 404 });
  const now = new Date().toISOString();
  db.prepare(`UPDATE inventory_items SET
    name=?, sku=?, category=?, branch_id=?, min_quantity=?, unit=?, active=?,
    auto_reorder=?, reorder_ticket_type_id=?, reorder_assignee_id=?, updated_at=?
    WHERE id=?`)
    .run(
      parsed.data.name ?? item.name,
      parsed.data.sku !== undefined ? parsed.data.sku : item.sku,
      parsed.data.category !== undefined ? parsed.data.category : item.category,
      parsed.data.branchId !== undefined ? parsed.data.branchId : item.branch_id,
      parsed.data.minQuantity ?? item.min_quantity,
      parsed.data.unit ?? item.unit,
      parsed.data.active !== undefined ? (parsed.data.active ? 1 : 0) : item.active,
      parsed.data.autoReorder !== undefined ? (parsed.data.autoReorder ? 1 : 0) : item.auto_reorder,
      parsed.data.reorderTicketTypeId !== undefined ? parsed.data.reorderTicketTypeId : item.reorder_ticket_type_id,
      parsed.data.reorderAssigneeId !== undefined ? parsed.data.reorderAssigneeId : item.reorder_assignee_id,
      now,
      id,
    );
  const updated = db.prepare("SELECT * FROM inventory_items WHERE id=?").get(id);
  return Response.json({ ok: true, item: mapInventoryItem(updated) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "inventory", "delete")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const db = getDb();
  const item = db.prepare("SELECT id FROM inventory_items WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!item) return Response.json({ error: "Item não encontrado." }, { status: 404 });
  // Preserva o histórico: itens com movimentações registradas não são apagados —
  // o caminho correto é desativar (active=false).
  const movements = db.prepare("SELECT COUNT(*) AS total FROM inventory_movements WHERE item_id=?").get(id).total;
  if (movements > 0) {
    return Response.json({ error: "Este item tem movimentações registradas. Desative-o em vez de excluir para preservar o histórico." }, { status: 409 });
  }
  db.prepare("DELETE FROM inventory_items WHERE id=?").run(id);
  return Response.json({ ok: true });
}

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "inventory", "update")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const parsed = movementSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Movimentação inválida." }, { status: 400 });
  const db = getDb();
  const item = db.prepare("SELECT * FROM inventory_items WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!item) return Response.json({ error: "Item não encontrado." }, { status: 404 });
  try {
    const result = applyStockMovement(db, {
      itemId: id,
      userId: auth.user.id,
      quantity: parsed.data.quantity,
      movementType: parsed.data.movementType,
      notes: parsed.data.notes,
    });
    const updated = db.prepare("SELECT * FROM inventory_items WHERE id=?").get(id);
    return Response.json({ item: mapInventoryItem(updated), ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
