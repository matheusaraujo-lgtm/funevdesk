import { requireCurrentUser, can } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/branch-scope";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

function loadTasks(db, projectId) {
  return db.prepare(`
    SELECT t.*, u.name assignee_name, col.is_done column_is_done,
      (SELECT COUNT(*) FROM project_task_comments c WHERE c.task_id=t.id) comment_count
    FROM project_tasks t
    LEFT JOIN users u ON u.id=t.assignee_id
    LEFT JOIN project_board_columns col ON col.id=t.column_id
    WHERE t.project_id=?
    ORDER BY t.position ASC, t.created_at ASC
  `).all(projectId);
}

const schema = z.object({
  title: z.string().min(2).max(160).optional(),
  description: z.string().max(3000).optional(),
  columnId: z.string().min(1).optional(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export async function PUT(request, { params }) {
  const { id, taskId } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "projects", "update")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!project) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  const accessError = assertBranchAccess(auth.user, project.branch_id);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  const task = db.prepare("SELECT * FROM project_tasks WHERE id=? AND project_id=?").get(taskId, id);
  if (!task) return Response.json({ error: "Tarefa não encontrada." }, { status: 404 });
  const data = parsed.data;
  if (data.assigneeId) {
    const assignee = db.prepare("SELECT id FROM users WHERE id=? AND organization_id=?").get(data.assigneeId, auth.user.organization_id);
    if (!assignee) return Response.json({ error: "Responsável inválido." }, { status: 400 });
  }
  if (data.columnId) {
    const column = db.prepare("SELECT id FROM project_board_columns WHERE id=? AND board_id=?").get(data.columnId, task.board_id);
    if (!column) return Response.json({ error: "Coluna inválida." }, { status: 400 });
  }
  let position = task.position;
  if (data.columnId && data.columnId !== task.column_id) {
    position = db.prepare("SELECT COALESCE(MAX(position), 0)+1 next FROM project_tasks WHERE project_id=? AND board_id=? AND column_id=?").get(id, task.board_id, data.columnId).next;
  }
  const now = new Date().toISOString();
  db.prepare("UPDATE project_tasks SET title=?, description=?, column_id=?, priority=?, assignee_id=?, due_date=?, position=?, updated_at=? WHERE id=?")
    .run(
      data.title ?? task.title,
      data.description ?? task.description,
      data.columnId ?? task.column_id,
      data.priority ?? task.priority,
      data.assigneeId !== undefined ? (data.assigneeId || null) : task.assignee_id,
      data.dueDate !== undefined ? (data.dueDate || null) : task.due_date,
      position,
      now,
      taskId,
    );
  db.prepare("UPDATE projects SET updated_at=? WHERE id=?").run(now, id);
  return Response.json({ tasks: loadTasks(db, id) });
}

export async function DELETE(request, { params }) {
  const { id, taskId } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "projects", "update")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!project) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  const accessError = assertBranchAccess(auth.user, project.branch_id);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  const task = db.prepare("SELECT id FROM project_tasks WHERE id=? AND project_id=?").get(taskId, id);
  if (!task) return Response.json({ error: "Tarefa não encontrada." }, { status: 404 });
  db.prepare("DELETE FROM project_tasks WHERE id=?").run(taskId);
  db.prepare("UPDATE projects SET updated_at=? WHERE id=?").run(new Date().toISOString(), id);
  return Response.json({ tasks: loadTasks(db, id) });
}
