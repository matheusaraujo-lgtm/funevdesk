import { requireCurrentUser, getPermissions } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().min(2).max(120),
  body: z.string().min(2).max(4000),
});

export function listMacros(db, organizationId) {
  return db.prepare(
    "SELECT id, title, body, created_by, created_at, updated_at FROM resolution_macros WHERE organization_id=? ORDER BY title COLLATE NOCASE"
  ).all(organizationId);
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  return Response.json({ macros: listMacros(db, auth.user.organization_id) });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const id = makeId("macro");
  const now = new Date().toISOString();
  db.prepare("INSERT INTO resolution_macros (id, organization_id, title, body, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, auth.user.organization_id, parsed.data.title.trim(), parsed.data.body.trim(), auth.user.id, now, now);
  return Response.json({ macros: listMacros(db, auth.user.organization_id) }, { status: 201 });
}
