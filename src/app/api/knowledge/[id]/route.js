import { getDb } from "@/lib/db";
import { can, getPermissions, requireCurrentUser } from "@/lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  branchId: z.string().nullable().optional(),
  title: z.string().min(3).max(160),
  category: z.string().min(2).max(80),
  content: z.string().min(5).max(100000),
});

export async function GET(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const permissions = getPermissions(currentUser);
  const article = db.prepare(`
    SELECT ka.*, b.name branch_name
    FROM knowledge_articles ka
    LEFT JOIN branches b ON b.id=ka.branch_id
    WHERE ka.id=? AND ka.organization_id=?
  `).get(id, currentUser.organization_id);
  if (!article) return Response.json({ error: "Artigo não encontrado." }, { status: 404 });
  if (article.branch_id && !permissions.canViewAllBranches && !currentUser.branchIds.includes(article.branch_id)) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }
  return Response.json({ article });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  // Autoriza ANTES de parsear o corpo: quem não pode editar não deve sondar o schema.
  if (!can(currentUser, "knowledge", "update")) return Response.json({ error: "Sem permissão para editar artigos." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Artigo inválido.", details: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.branchId) {
    const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(parsed.data.branchId, currentUser.organization_id);
    if (!branch) return Response.json({ error: "Unidade inválida." }, { status: 400 });
  }

  const result = db.prepare(`
    UPDATE knowledge_articles SET branch_id=?, title=?, category=?, content=?, updated_at=?
    WHERE id=? AND organization_id=?
  `).run(parsed.data.branchId || null, parsed.data.title, parsed.data.category, parsed.data.content, new Date().toISOString(), id, currentUser.organization_id);
  if (!result.changes) return Response.json({ error: "Artigo não encontrado." }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!can(currentUser, "knowledge", "delete")) return Response.json({ error: "Sem permissão para excluir artigos." }, { status: 403 });
  const result = db.prepare("DELETE FROM knowledge_articles WHERE id=? AND organization_id=?").run(id, currentUser.organization_id);
  if (!result.changes) return Response.json({ error: "Artigo não encontrado." }, { status: 404 });
  return Response.json({ ok: true });
}
