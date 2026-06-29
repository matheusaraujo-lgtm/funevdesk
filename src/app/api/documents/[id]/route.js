import { getDb } from "@/lib/db";
import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  branchId: z.string().min(1),
  title: z.string().min(3).max(160),
  documentType: z.string().min(2).max(80),
  content: z.string().min(5).max(50000),
});

export async function GET(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const permissions = getPermissions(currentUser);
  const document = db.prepare(`
    SELECT d.*, b.name branch_name, b.type branch_type
    FROM it_documents d JOIN branches b ON b.id=d.branch_id
    WHERE d.id=? AND d.organization_id=?
  `).get(id, currentUser.organization_id);
  if (!document) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
  if (!permissions.canViewAllBranches && !currentUser.branchIds.includes(document.branch_id)) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }
  return Response.json({ document });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Documento inválido.", details: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!getPermissions(currentUser).canManageTickets) return Response.json({ error: "Sem permissão para editar documentação." }, { status: 403 });
  const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(parsed.data.branchId, currentUser.organization_id);
  if (!branch) return Response.json({ error: "Unidade inválida." }, { status: 400 });
  const result = db.prepare(`
    UPDATE it_documents SET branch_id=?, title=?, document_type=?, content=?, updated_at=?
    WHERE id=? AND organization_id=?
  `).run(parsed.data.branchId, parsed.data.title, parsed.data.documentType, parsed.data.content, new Date().toISOString(), id, currentUser.organization_id);
  if (!result.changes) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!getPermissions(currentUser).canConfigure) return Response.json({ error: "Apenas administradores podem excluir documentação." }, { status: 403 });
  const result = db.prepare("DELETE FROM it_documents WHERE id=? AND organization_id=?").run(id, currentUser.organization_id);
  if (!result.changes) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
  return Response.json({ ok: true });
}
