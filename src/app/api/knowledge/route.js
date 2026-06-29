import { getDb, makeId } from "@/lib/db";
import { can, getPermissions, requireCurrentUser } from "@/lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const articleSchema = z.object({
  branchId: z.string().nullable().optional(),
  title: z.string().min(3).max(160),
  category: z.string().min(2).max(80),
  content: z.string().min(5).max(100000),
});

export async function GET(request) {
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const permissions = getPermissions(currentUser);
  const branchFilter = permissions.canViewAllBranches ? "" : `AND (branch_id IS NULL OR branch_id IN (${currentUser.branchIds.map(() => "?").join(",")}))`;
  const params = permissions.canViewAllBranches ? [currentUser.organization_id] : [currentUser.organization_id, ...currentUser.branchIds];
  const articles = db.prepare(`
    SELECT ka.*, b.name branch_name
    FROM knowledge_articles ka LEFT JOIN branches b ON b.id=ka.branch_id
    WHERE ka.organization_id=? ${branchFilter}
    ORDER BY ka.updated_at DESC
  `).all(...params);
  return Response.json({ articles });
}

export async function POST(request) {
  const parsed = articleSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Artigo inválido.", details: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!can(currentUser, "knowledge", "create")) return Response.json({ error: "Sem permissão para salvar artigos." }, { status: 403 });
  const now = new Date().toISOString();
  const id = makeId("kb");
  db.prepare(`INSERT INTO knowledge_articles
    (id, organization_id, branch_id, title, category, content, created_by, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, currentUser.organization_id, parsed.data.branchId || null, parsed.data.title, parsed.data.category, parsed.data.content, currentUser.id, now, now);
  return Response.json({ id }, { status: 201 });
}
