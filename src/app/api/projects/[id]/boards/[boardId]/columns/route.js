import { requireCurrentUser, can } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/branch-scope";
import { getDb, makeId } from "@/lib/db";
import { loadBoardsWithColumns } from "@/lib/project-boards";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  label: z.string().min(1).max(60),
  color: z.string().min(3).max(20).default("slate"),
  isDone: z.boolean().default(false),
});

export async function POST(request, { params }) {
  const { id, boardId } = await params;
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
  const board = db.prepare("SELECT id FROM project_boards WHERE id=? AND project_id=?").get(boardId, id);
  if (!board) return Response.json({ error: "Quadro não encontrado." }, { status: 404 });
  const position = db.prepare("SELECT COALESCE(MAX(position), -1)+1 next FROM project_board_columns WHERE board_id=?").get(boardId).next;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO project_board_columns (id, board_id, label, color, position, is_done, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(makeId("pbc"), boardId, parsed.data.label, parsed.data.color, position, parsed.data.isDone ? 1 : 0, now, now);
  return Response.json({ boards: loadBoardsWithColumns(db, id) }, { status: 201 });
}
