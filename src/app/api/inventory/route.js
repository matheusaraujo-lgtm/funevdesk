import { can, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { listInventoryItems } from "@/lib/inventory";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(120),
  sku: z.string().max(40).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  branchId: z.string().nullable().optional(),
  quantity: z.number().int().min(0).optional().default(0),
  minQuantity: z.number().int().min(0).optional().default(0),
  unit: z.string().max(20).optional().default("un"),
  autoReorder: z.boolean().optional().default(false),
  reorderTicketTypeId: z.string().nullable().optional(),
  reorderAssigneeId: z.string().nullable().optional(),
});

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "inventory", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const url = new URL(request.url);

  if (url.searchParams.get("mode") === "template") {
    return Response.json({
      columns: ["name", "sku", "category", "quantity", "minQuantity", "unit"],
      example: { name: "Mouse USB", sku: "MOU-001", category: "Periféricos", quantity: "25", minQuantity: "5", unit: "un" },
    });
  }

  const branchId = url.searchParams.get("branchId") || undefined;
  const items = listInventoryItems(db, auth.user.organization_id, { branchId, activeOnly: false });
  return Response.json({ items });
}

// Importação em lote de itens de estoque. Regras: nome obrigatório; quantidade/mínimo
// numéricos (>=0); upsert por (organização, nome, sku) — reimportar atualiza a quantidade.
function importInventoryRows(db, organizationId, rows) {
  const now = new Date().toISOString();
  let imported = 0;
  const run = db.transaction(() => {
    const find = db.prepare("SELECT id FROM inventory_items WHERE organization_id=? AND name=? AND COALESCE(sku,'')=COALESCE(?,'') LIMIT 1");
    const insert = db.prepare(`INSERT INTO inventory_items
      (id, organization_id, branch_id, name, sku, category, quantity, min_quantity, unit, auto_reorder, active, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`);
    const update = db.prepare("UPDATE inventory_items SET category=?, quantity=?, min_quantity=?, unit=?, updated_at=? WHERE id=?");
    rows.forEach((row, index) => {
      const name = String(row.name || "").trim();
      if (!name) throw new Error(`Linha ${index + 2}: o nome do item é obrigatório.`);
      const quantity = Math.max(0, Math.trunc(Number(row.quantity) || 0));
      const minQuantity = Math.max(0, Math.trunc(Number(row.minQuantity) || 0));
      const sku = String(row.sku || "").trim() || null;
      const category = String(row.category || "").trim() || null;
      const unit = String(row.unit || "").trim() || "un";
      const existing = find.get(organizationId, name, sku);
      if (existing) update.run(category, quantity, minQuantity, unit, now, existing.id);
      else insert.run(makeId("inv"), organizationId, name, sku, category, quantity, minQuantity, unit, now, now);
      imported += 1;
    });
  });
  run();
  return imported;
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "inventory", "create")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const body = await request.json();

  // Importação por planilha.
  if (Array.isArray(body?.rows)) {
    if (!body.rows.length) return Response.json({ error: "Planilha vazia." }, { status: 400 });
    const db = getDb();
    try {
      const imported = importInventoryRows(db, auth.user.organization_id, body.rows);
      return Response.json({ imported });
    } catch (error) {
      return Response.json({ error: error.message || "Não foi possível importar." }, { status: 400 });
    }
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  if (parsed.data.branchId) {
    const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(parsed.data.branchId, auth.user.organization_id);
    if (!branch) return Response.json({ error: "Unidade inválida." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const id = makeId("inv");
  db.prepare(`INSERT INTO inventory_items
    (id, organization_id, branch_id, name, sku, category, quantity, min_quantity, unit, auto_reorder, reorder_ticket_type_id, reorder_assignee_id, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .run(
      id,
      auth.user.organization_id,
      parsed.data.branchId || null,
      parsed.data.name.trim(),
      parsed.data.sku || null,
      parsed.data.category || null,
      parsed.data.quantity,
      parsed.data.minQuantity,
      parsed.data.unit,
      parsed.data.autoReorder ? 1 : 0,
      parsed.data.reorderTicketTypeId || null,
      parsed.data.reorderAssigneeId || null,
      now,
      now,
    );
  return Response.json({ id }, { status: 201 });
}
