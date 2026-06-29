import { can, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(80),
  color: z.string().min(3).max(20).optional().default("blue"),
});

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const db = getDb();
  const categories = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM ticket_types t WHERE t.category_id=c.id) type_count
    FROM ticket_categories c
    WHERE c.organization_id=?
    ORDER BY c.active DESC, c.name
  `).all(auth.user.organization_id).map((row) => ({ ...row, active: Boolean(row.active) }));
  return Response.json({ categories });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "categories", "create")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const id = makeId("cat");
  const now = new Date().toISOString();
  try {
    db.prepare("INSERT INTO ticket_categories (id, organization_id, name, color, active, created_at) VALUES (?, ?, ?, ?, 1, ?)")
      .run(id, auth.user.organization_id, parsed.data.name.trim(), parsed.data.color, now);
  } catch {
    return Response.json({ error: "Já existe uma categoria com este nome." }, { status: 409 });
  }
  return Response.json({ id }, { status: 201 });
}
