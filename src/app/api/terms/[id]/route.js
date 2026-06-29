import { getDb } from "@/lib/db";
import { getPermissions, requireCurrentUser, can } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  // Termo individual contém PII; exige permissão de módulo (não basta estar na filial).
  if (!can(currentUser, "terms", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const permissions = getPermissions(currentUser);
  const term = db.prepare(`
    SELECT et.*, a.hostname, a.patrimony_number, b.name branch_name
    FROM equipment_terms et
    JOIN assets a ON a.id=et.asset_id
    JOIN branches b ON b.id=et.branch_id
    WHERE et.id=? AND et.organization_id=?
  `).get(id, currentUser.organization_id);
  if (!term) return Response.json({ error: "Termo não encontrado." }, { status: 404 });
  if (!permissions.canViewAllBranches && !currentUser.branchIds.includes(term.branch_id)) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }
  return Response.json({ term });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!getPermissions(currentUser).canConfigure) return Response.json({ error: "Apenas administradores podem excluir termos." }, { status: 403 });
  const result = db.prepare("DELETE FROM equipment_terms WHERE id=? AND organization_id=?").run(id, currentUser.organization_id);
  if (!result.changes) return Response.json({ error: "Termo não encontrado." }, { status: 404 });
  return Response.json({ ok: true });
}
