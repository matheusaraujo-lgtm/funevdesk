import { can, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(80).optional(),
  color: z.string().min(3).max(20).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "categories", "update")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const row = db.prepare("SELECT * FROM ticket_categories WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!row) return Response.json({ error: "Categoria não encontrada." }, { status: 404 });
  const name = parsed.data.name?.trim() || row.name;
  const color = parsed.data.color || row.color;
  const active = parsed.data.active !== undefined ? (parsed.data.active ? 1 : 0) : row.active;
  db.prepare("UPDATE ticket_categories SET name=?, color=?, active=? WHERE id=?").run(name, color, active, id);
  if (name !== row.name) {
    db.prepare("UPDATE ticket_types SET category=? WHERE category_id=?").run(name, id);
  }
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "categories", "delete")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const db = getDb();
  const linked = db.prepare("SELECT COUNT(*) count FROM ticket_types WHERE category_id=?").get(id).count;
  if (linked) return Response.json({ error: "Categoria vinculada a tipos de chamado." }, { status: 409 });
  db.prepare("DELETE FROM ticket_categories WHERE id=? AND organization_id=?").run(id, auth.user.organization_id);
  return Response.json({ ok: true });
}
