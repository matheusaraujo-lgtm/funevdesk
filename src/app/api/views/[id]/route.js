import { requireCurrentUser, getPermissions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listViews } from "../route";

export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const view = db.prepare("SELECT id FROM saved_views WHERE id=? AND organization_id=? AND user_id=?").get(id, auth.user.organization_id, auth.user.id);
  if (!view) return Response.json({ error: "Visão não encontrada." }, { status: 404 });
  db.prepare("DELETE FROM saved_views WHERE id=?").run(id);
  return Response.json({ views: listViews(db, auth.user.organization_id, auth.user.id) });
}
