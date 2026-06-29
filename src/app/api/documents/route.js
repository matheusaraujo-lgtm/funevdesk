import { getDb, makeId } from "@/lib/db";
import { getPermissions, requireCurrentUser, can } from "@/lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const documentSchema = z.object({
  branchId: z.string().min(1),
  title: z.string().min(3).max(160),
  documentType: z.string().min(2).max(80),
  content: z.string().min(5).max(50000),
});

export async function GET(request) {
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!can(currentUser, "documentation", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const permissions = getPermissions(currentUser);
  const branchIds = permissions.canViewAllBranches ? db.prepare("SELECT id FROM branches WHERE organization_id=?").all(currentUser.organization_id).map((item) => item.id) : currentUser.branchIds;
  const docs = branchIds.length ? db.prepare(`
    SELECT d.*, b.name branch_name, b.type branch_type
    FROM it_documents d JOIN branches b ON b.id=d.branch_id
    WHERE d.organization_id=? AND d.branch_id IN (${branchIds.map(() => "?").join(",")})
    ORDER BY b.type, b.name, d.updated_at DESC
  `).all(currentUser.organization_id, ...branchIds) : [];
  return Response.json({ documents: docs });
}

export async function POST(request) {
  const parsed = documentSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Documento inválido.", details: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!getPermissions(currentUser).canManageTickets) return Response.json({ error: "Sem permissão para salvar documentação." }, { status: 403 });
  const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(parsed.data.branchId, currentUser.organization_id);
  if (!branch) return Response.json({ error: "Unidade inválida." }, { status: 400 });
  const now = new Date().toISOString();
  const id = makeId("doc");
  db.prepare(`INSERT INTO it_documents
    (id, organization_id, branch_id, title, document_type, content, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, currentUser.organization_id, branch.id, parsed.data.title, parsed.data.documentType, parsed.data.content, now, now);
  return Response.json({ id }, { status: 201 });
}
