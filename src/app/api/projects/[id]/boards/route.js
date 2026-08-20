import { requireCurrentUser, can } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/branch-scope";
import { getDb, makeId } from "@/lib/db";
import { loadBoardsWithColumns, seedDefaultColumns } from "@/lib/project-boards";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(80),
});

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
  const position = db.prepare("SELECT COALESCE(MAX(position), -1)+1 next FROM project_boards WHERE project_id=?").get(id).next;
  const boardId = makeId("pjb");
  const now = new Date().toISOString();
  db.prepare("INSERT INTO project_boards (id, project_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(boardId, id, parsed.data.name, position, now, now);
  seedDefaultColumns(db, boardId);
  return Response.json({ boards: loadBoardsWithColumns(db, id) }, { status: 201 });
}
