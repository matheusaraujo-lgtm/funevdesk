import { requireCurrentUser, can } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/branch-scope";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  body: z.string().min(1).max(2000),
});

function loadComments(db, taskId) {
  return db.prepare(`
    SELECT * FROM project_task_comments WHERE task_id=? ORDER BY created_at ASC
  `).all(taskId);
}

async function loadTaskWithProject(db, projectId, taskId, organizationId) {
  const project = db.prepare("SELECT id, branch_id FROM projects WHERE id=? AND organization_id=?").get(projectId, organizationId);
  if (!project) return { project: null, task: null };
  const task = db.prepare("SELECT id FROM project_tasks WHERE id=? AND project_id=?").get(taskId, projectId);
  return { project, task };
}

export async function GET(request, { params }) {
  const { id, taskId } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "projects", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const { project, task } = await loadTaskWithProject(db, id, taskId, auth.user.organization_id);
  if (!project) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  if (!task) return Response.json({ error: "Tarefa não encontrada." }, { status: 404 });
  const accessError = assertBranchAccess(auth.user, project.branch_id);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  return Response.json({ comments: loadComments(db, taskId) });
}

export async function POST(request, { params }) {
  const { id, taskId } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "projects", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Escreva um comentário." }, { status: 400 });
  const db = getDb();
  const { project, task } = await loadTaskWithProject(db, id, taskId, auth.user.organization_id);
  if (!project) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  if (!task) return Response.json({ error: "Tarefa não encontrada." }, { status: 404 });
  const accessError = assertBranchAccess(auth.user, project.branch_id);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  const now = new Date().toISOString();
  db.prepare("INSERT INTO project_task_comments (id, task_id, author_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(makeId("pjc"), taskId, auth.user.id, auth.user.name, parsed.data.body, now);
  return Response.json({ comments: loadComments(db, taskId) }, { status: 201 });
}
