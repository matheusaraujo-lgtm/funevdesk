import { requireCurrentUser, can } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/branch-scope";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

function loadProject(db, id, organizationId) {
  return db.prepare(`
    SELECT p.*, u.name owner_name, b.name branch_name
    FROM projects p
    LEFT JOIN users u ON u.id=p.owner_id
    LEFT JOIN branches b ON b.id=p.branch_id
    WHERE p.id=? AND p.organization_id=?
  `).get(id, organizationId);
}

function loadTasks(db, projectId) {
  return db.prepare(`
    SELECT t.*, u.name assignee_name,
      (SELECT COUNT(*) FROM project_task_comments c WHERE c.task_id=t.id) comment_count
    FROM project_tasks t
    LEFT JOIN users u ON u.id=t.assignee_id
    WHERE t.project_id=?
    ORDER BY t.position ASC, t.created_at ASC
  `).all(projectId);
}

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "projects", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const project = loadProject(db, id, auth.user.organization_id);
  if (!project) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  const accessError = assertBranchAccess(auth.user, project.branch_id);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  return Response.json({ project: { ...project, tasks: loadTasks(db, id) } });
}

const updateSchema = z.object({
  name: z.string().min(3).max(160).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(["PLANEJAMENTO", "EM_ANDAMENTO", "PAUSADO", "PENDENTE", "CONCLUIDO", "CANCELADO"]).optional(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]).optional(),
  ownerId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  pendingReason: z.string().max(2000).nullable().optional(),
});

export async function PUT(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "projects", "update")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!project) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  const accessError = assertBranchAccess(auth.user, project.branch_id);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  const data = parsed.data;
  if (data.ownerId) {
    const owner = db.prepare("SELECT id FROM users WHERE id=? AND organization_id=?").get(data.ownerId, auth.user.organization_id);
    if (!owner) return Response.json({ error: "Responsável inválido." }, { status: 400 });
  }
  const nextStatus = data.status ?? project.status;
  const nextPendingReason = data.pendingReason !== undefined ? (data.pendingReason || null) : project.pending_reason;
  if (nextStatus === "PENDENTE" && !nextPendingReason) {
    return Response.json({ error: "Informe o motivo da pendência." }, { status: 400 });
  }
  const now = new Date().toISOString();
  db.prepare("UPDATE projects SET name=?, description=?, status=?, priority=?, owner_id=?, start_date=?, due_date=?, pending_reason=?, updated_at=? WHERE id=?")
    .run(
      data.name ?? project.name,
      data.description ?? project.description,
      nextStatus,
      data.priority ?? project.priority,
      data.ownerId !== undefined ? (data.ownerId || null) : project.owner_id,
      data.startDate !== undefined ? (data.startDate || null) : project.start_date,
      data.dueDate !== undefined ? (data.dueDate || null) : project.due_date,
      nextStatus === "PENDENTE" ? nextPendingReason : null,
      now,
      id,
    );
  return Response.json({ project: loadProject(db, id, auth.user.organization_id) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "projects", "delete")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!project) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  const accessError = assertBranchAccess(auth.user, project.branch_id);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  db.transaction(() => {
    db.prepare("DELETE FROM project_tasks WHERE project_id=?").run(id);
    db.prepare("DELETE FROM projects WHERE id=?").run(id);
  })();
  return Response.json({ ok: true });
}
