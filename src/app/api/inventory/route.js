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
  const branchId = new URL(request.url).searchParams.get("branchId") || undefined;
  const items = listInventoryItems(db, auth.user.organization_id, { branchId, activeOnly: false });
  return Response.json({ items });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "inventory", "create")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
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
