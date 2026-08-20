import { requireCurrentUser, can } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/branch-scope";
import { getDb } from "@/lib/db";
import { loadBoardsWithColumns } from "@/lib/project-boards";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  columnIds: z.array(z.string().min(1)).min(1),
});

export async function PUT(request, { params }) {
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
  const existingIds = new Set(db.prepare("SELECT id FROM project_board_columns WHERE board_id=?").all(boardId).map((c) => c.id));
  const orderedIds = parsed.data.columnIds.filter((columnId) => existingIds.has(columnId));
  if (orderedIds.length !== existingIds.size) return Response.json({ error: "Lista de colunas inválida." }, { status: 400 });
  const now = new Date().toISOString();
  const update = db.prepare("UPDATE project_board_columns SET position=?, updated_at=? WHERE id=?");
  db.transaction(() => {
    orderedIds.forEach((columnId, index) => update.run(index, now, columnId));
  })();
  return Response.json({ boards: loadBoardsWithColumns(db, id) });
}
