import { requireCurrentUser, can } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/branch-scope";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(3000).optional().default(""),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]).default("MEDIA"),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  boardId: z.string().min(1),
  columnId: z.string().min(1).optional(),
});

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

export async function POST(request, { params }) {
  const { id } = await params;
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
  if (parsed.data.assigneeId) {
    const assignee = db.prepare("SELECT id FROM users WHERE id=? AND organization_id=?").get(parsed.data.assigneeId, auth.user.organization_id);
    if (!assignee) return Response.json({ error: "Responsável inválido." }, { status: 400 });
  }
  const board = db.prepare("SELECT id FROM project_boards WHERE id=? AND project_id=?").get(parsed.data.boardId, id);
  if (!board) return Response.json({ error: "Quadro inválido." }, { status: 400 });
  let columnId = parsed.data.columnId || null;
  if (columnId) {
    const column = db.prepare("SELECT id FROM project_board_columns WHERE id=? AND board_id=?").get(columnId, board.id);
    if (!column) return Response.json({ error: "Coluna inválida." }, { status: 400 });
  } else {
    columnId = db.prepare("SELECT id FROM project_board_columns WHERE board_id=? ORDER BY position ASC, created_at ASC LIMIT 1").get(board.id)?.id || null;
  }
  const position = db.prepare("SELECT COALESCE(MAX(position), 0)+1 next FROM project_tasks WHERE project_id=? AND board_id=? AND column_id=?").get(id, board.id, columnId).next;
  const taskId = makeId("pjt");
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO project_tasks (id, project_id, board_id, column_id, title, description, status, priority, assignee_id, due_date, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'A_FAZER', ?, ?, ?, ?, ?, ?)`)
    .run(taskId, id, board.id, columnId, parsed.data.title, parsed.data.description || "", parsed.data.priority, parsed.data.assigneeId || null, parsed.data.dueDate || null, position, now, now);
  db.prepare("UPDATE projects SET updated_at=? WHERE id=?").run(now, id);
  return Response.json({ tasks: loadTasks(db, id) }, { status: 201 });
}
