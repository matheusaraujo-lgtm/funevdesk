import { requireCurrentUser, getPermissions } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(1).max(60),
  filters: z.record(z.string(), z.any()),
});

export function listViews(db, organizationId, userId) {
  return db.prepare(
    "SELECT id, name, filters_json, created_at FROM saved_views WHERE organization_id=? AND user_id=? ORDER BY name COLLATE NOCASE"
  ).all(organizationId, userId).map((row) => {
    let filters = {};
    try { filters = JSON.parse(row.filters_json) || {}; } catch { filters = {}; }
    return { id: row.id, name: row.name, filters, createdAt: row.created_at };
  });
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  return Response.json({ views: listViews(db, auth.user.organization_id, auth.user.id) });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const id = makeId("view");
  db.prepare("INSERT INTO saved_views (id, organization_id, user_id, name, filters_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, auth.user.organization_id, auth.user.id, parsed.data.name.trim(), JSON.stringify(parsed.data.filters), new Date().toISOString());
  return Response.json({ views: listViews(db, auth.user.organization_id, auth.user.id) }, { status: 201 });
}
