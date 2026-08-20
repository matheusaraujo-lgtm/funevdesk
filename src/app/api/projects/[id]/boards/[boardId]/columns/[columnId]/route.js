import { requireCurrentUser, can } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/branch-scope";
import { getDb } from "@/lib/db";
import { loadBoardsWithColumns } from "@/lib/project-boards";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  label: z.string().min(1).max(60).optional(),
  color: z.string().min(3).max(20).optional(),
  isDone: z.boolean().optional(),
});

async function loadContext(request, params) {
  const { id, boardId, columnId } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return { error: auth.error };
  if (!can(auth.user, "projects", "update")) return { error: Response.json({ error: "Acesso negado." }, { status: 403 }) };
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!project) return { error: Response.json({ error: "Projeto não encontrado." }, { status: 404 }) };
  const accessError = assertBranchAccess(auth.user, project.branch_id);
  if (accessError) return { error: Response.json({ error: accessError.message }, { status: 403 }) };
  const column = db.prepare("SELECT * FROM project_board_columns WHERE id=? AND board_id=?").get(columnId, boardId);
  if (!column) return { error: Response.json({ error: "Coluna não encontrada." }, { status: 404 }) };
  return { db, id, boardId, columnId, column };
}

export async function PUT(request, { params }) {
  const ctx = await loadContext(request, params);
  if (ctx.error) return ctx.error;
  const { db, id, columnId, column } = ctx;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = parsed.data;
  db.prepare("UPDATE project_board_columns SET label=?, color=?, is_done=?, updated_at=? WHERE id=?")
    .run(
      data.label ?? column.label,
      data.color ?? column.color,
      data.isDone !== undefined ? (data.isDone ? 1 : 0) : column.is_done,
      new Date().toISOString(),
      columnId,
    );
  return Response.json({ boards: loadBoardsWithColumns(db, id) });
}

export async function DELETE(request, { params }) {
  const ctx = await loadContext(request, params);
  if (ctx.error) return ctx.error;
  const { db, id, boardId, columnId } = ctx;
  const columnCount = db.prepare("SELECT COUNT(*) count FROM project_board_columns WHERE board_id=?").get(boardId).count;
  if (columnCount <= 1) return Response.json({ error: "O quadro precisa de pelo menos uma coluna." }, { status: 409 });
  const taskCount = db.prepare("SELECT COUNT(*) count FROM project_tasks WHERE column_id=?").get(columnId).count;
  if (taskCount > 0) return Response.json({ error: "Mova ou exclua as tarefas desta coluna antes de excluí-la." }, { status: 409 });
  db.prepare("DELETE FROM project_board_columns WHERE id=?").run(columnId);
  return Response.json({ boards: loadBoardsWithColumns(db, id) });
}
