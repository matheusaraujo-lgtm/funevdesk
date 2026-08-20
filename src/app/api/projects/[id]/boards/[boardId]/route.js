import { requireCurrentUser, can } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/branch-scope";
import { getDb } from "@/lib/db";
import { loadBoardsWithColumns } from "@/lib/project-boards";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(80),
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

async function loadContext(request, params) {
  const { id, boardId } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return { error: auth.error };
  if (!can(auth.user, "projects", "update")) return { error: Response.json({ error: "Acesso negado." }, { status: 403 }) };
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!project) return { error: Response.json({ error: "Projeto não encontrado." }, { status: 404 }) };
  const accessError = assertBranchAccess(auth.user, project.branch_id);
  if (accessError) return { error: Response.json({ error: accessError.message }, { status: 403 }) };
  const board = db.prepare("SELECT * FROM project_boards WHERE id=? AND project_id=?").get(boardId, id);
  if (!board) return { error: Response.json({ error: "Quadro não encontrado." }, { status: 404 }) };
  return { db, id, boardId, board };
}

export async function PUT(request, { params }) {
  const ctx = await loadContext(request, params);
  if (ctx.error) return ctx.error;
  const { db, id, boardId } = ctx;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  db.prepare("UPDATE project_boards SET name=?, updated_at=? WHERE id=?").run(parsed.data.name, new Date().toISOString(), boardId);
  return Response.json({ boards: loadBoardsWithColumns(db, id) });
}

export async function DELETE(request, { params }) {
  const ctx = await loadContext(request, params);
  if (ctx.error) return ctx.error;
  const { db, id, boardId } = ctx;
  const boardCount = db.prepare("SELECT COUNT(*) count FROM project_boards WHERE project_id=?").get(id).count;
  if (boardCount <= 1) return Response.json({ error: "O projeto precisa de pelo menos um quadro." }, { status: 409 });
  db.prepare("DELETE FROM project_boards WHERE id=?").run(boardId);
  return Response.json({ boards: loadBoardsWithColumns(db, id), tasks: loadTasks(db, id) });
}
