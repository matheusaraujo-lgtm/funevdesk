import { authorize } from "@/lib/authorize";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(80).optional(),
  code: z.string().max(40).optional().nullable(),
  branchId: z.string().min(1).optional(),
});

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = authorize(request, { module: "locations", action: "update" });
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  const db = getDb();
  const row = db.prepare("SELECT * FROM locations WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!row) return Response.json({ error: "Localização não encontrada." }, { status: 404 });
  const denied = auth.branchGate(row.branch_id) || auth.branchGate(parsed.data.branchId);
  if (denied) return denied;

  const name = parsed.data.name?.trim() || row.name;
  const code = parsed.data.code !== undefined ? (parsed.data.code?.trim() || null) : row.code;
  let branchId = row.branch_id;
  if (parsed.data.branchId) {
    const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(parsed.data.branchId, auth.user.organization_id);
    if (!branch) return Response.json({ error: "Unidade inválida." }, { status: 400 });
    branchId = parsed.data.branchId;
  }

  db.prepare("UPDATE locations SET name=?, code=?, branch_id=? WHERE id=? AND organization_id=?")
    .run(name, code, branchId, id, auth.user.organization_id);
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = authorize(request, { module: "locations", action: "delete" });
  if (auth.error) return auth.error;

  const db = getDb();
  const row = db.prepare("SELECT id, branch_id FROM locations WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!row) return Response.json({ error: "Localização não encontrada." }, { status: 404 });
  const denied = auth.branchGate(row.branch_id);
  if (denied) return denied;

  const ticketCount = db.prepare("SELECT COUNT(*) count FROM tickets WHERE location_id=? AND organization_id=?")
    .get(id, auth.user.organization_id).count;
  if (ticketCount) {
    return Response.json({ error: "Localização vinculada a chamados. Remova os vínculos antes de excluir." }, { status: 409 });
  }
  const userCount = db.prepare("SELECT COUNT(*) count FROM users WHERE location_id=? AND organization_id=?")
    .get(id, auth.user.organization_id).count;
  if (userCount) {
    return Response.json({ error: "Localização vinculada a usuários. Remova os vínculos antes de excluir." }, { status: 409 });
  }

  db.prepare("DELETE FROM locations WHERE id=? AND organization_id=?").run(id, auth.user.organization_id);
  return Response.json({ ok: true });
}
