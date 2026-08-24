import { requireCurrentUser, can } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { assertBranchAccess, branchFilterClause, getAllowedBranchIds } from "@/lib/branch-scope";
import { getDb, makeId } from "@/lib/db";
import { seedDefaultColumns } from "@/lib/project-boards";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(3).max(160),
  description: z.string().max(5000).optional().default(""),
  branchId: z.string().min(1),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]).default("MEDIA"),
  ownerId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export function listProjects(db, organizationId, branchIds = null) {
  const scope = branchIds && branchIds.length ? branchFilterClause(branchIds, "p.branch_id") : { clause: "1=0", params: [] };
  return db.prepare(`
    SELECT p.*, u.name owner_name, b.name branch_name,
      (SELECT COUNT(*) FROM project_tasks pt WHERE pt.project_id=p.id) task_count,
      (SELECT COUNT(*) FROM project_tasks pt JOIN project_board_columns pc ON pc.id=pt.column_id WHERE pt.project_id=p.id AND pc.is_done=1) done_count
    FROM projects p
    LEFT JOIN users u ON u.id=p.owner_id
    LEFT JOIN branches b ON b.id=p.branch_id
    WHERE p.organization_id=? AND ${scope.clause}
    ORDER BY p.updated_at DESC
  `).all(organizationId, ...scope.params);
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "projects", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const requestedBranchId = new URL(request.url).searchParams.get("branchId");
  const scopedBranchIds = getAllowedBranchIds(auth.user, db, requestedBranchId || null);
  return Response.json({ projects: listProjects(db, auth.user.organization_id, scopedBranchIds) });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "projects", "create")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const accessError = assertBranchAccess(auth.user, parsed.data.branchId);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  const db = getDb();
  const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(parsed.data.branchId, auth.user.organization_id);
  if (!branch) return Response.json({ error: "Unidade inválida." }, { status: 400 });
  if (parsed.data.ownerId) {
    const owner = db.prepare("SELECT id FROM users WHERE id=? AND organization_id=?").get(parsed.data.ownerId, auth.user.organization_id);
    if (!owner) return Response.json({ error: "Responsável inválido." }, { status: 400 });
  }
  const number = db.prepare("SELECT COALESCE(MAX(number), 100)+1 next FROM projects WHERE organization_id=?").get(auth.user.organization_id).next;
  const id = makeId("prj");
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO projects (id, organization_id, branch_id, number, name, description, status, priority, owner_id, start_date, due_date, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PLANEJAMENTO', ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, auth.user.organization_id, parsed.data.branchId, number, parsed.data.name, parsed.data.description || "", parsed.data.priority, parsed.data.ownerId || null, parsed.data.startDate || null, parsed.data.dueDate || null, auth.user.id, now, now);
  const boardId = makeId("pjb");
  db.prepare("INSERT INTO project_boards (id, project_id, name, position, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)")
    .run(boardId, id, "Quadro principal", now, now);
  seedDefaultColumns(db, boardId);
  logAudit(db, { organizationId: auth.user.organization_id, branchId: parsed.data.branchId, actorId: auth.user.id, actorName: auth.user.name, entityType: "project", entityId: id, action: "CREATE", details: parsed.data.name });
  return Response.json({ projects: listProjects(db, auth.user.organization_id, getAllowedBranchIds(auth.user, db)) }, { status: 201 });
}
