import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listSoftwarePackages } from "../route";

export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canConfigure) {
    return Response.json({ error: "Apenas administradores podem editar o catálogo." }, { status: 403 });
  }
  const db = getDb();
  const result = db.prepare("DELETE FROM software_packages WHERE id=? AND organization_id=?").run(id, auth.user.organization_id);
  if (!result.changes) return Response.json({ error: "Aplicativo não encontrado." }, { status: 404 });
  return Response.json({ packages: listSoftwarePackages(db, auth.user.organization_id) });
}
