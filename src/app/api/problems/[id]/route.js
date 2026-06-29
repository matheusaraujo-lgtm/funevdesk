import { requireCurrentUser, getPermissions } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/branch-scope";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().min(5).max(160).optional(),
  description: z.string().min(5).max(5000).optional(),
  status: z.enum(["ABERTO", "ANALISE", "CONHECIDO", "RESOLVIDO"]).optional(),
  rootCause: z.string().max(2000).optional(),
  workaround: z.string().max(2000).optional(),
  assigneeId: z.string().nullable().optional(),
});

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const problem = db.prepare("SELECT * FROM problems WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!problem) return Response.json({ error: "Problema não encontrado." }, { status: 404 });
  const accessError = assertBranchAccess(auth.user, problem.branch_id);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  const incidents = db.prepare(
    `SELECT t.id, t.number, t.title, t.status, u.name requester_name
     FROM tickets t LEFT JOIN users u ON u.id = t.requester_id
     WHERE t.problem_id=? ORDER BY t.number DESC`
  ).all(id);
  const candidates = db.prepare(
    `SELECT t.id, t.number, t.title, t.status, u.name requester_name
     FROM tickets t LEFT JOIN users u ON u.id = t.requester_id
     WHERE t.organization_id=? AND (t.problem_id IS NULL OR t.problem_id='')
       AND t.status NOT IN ('RESOLVIDO','FECHADO','CANCELADO')
     ORDER BY t.number DESC LIMIT 50`
  ).all(auth.user.organization_id);
  return Response.json({ problem, incidents, candidates });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const problem = db.prepare("SELECT * FROM problems WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!problem) return Response.json({ error: "Problema não encontrado." }, { status: 404 });
  const accessError = assertBranchAccess(auth.user, problem.branch_id);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  const now = new Date().toISOString();
  db.prepare(`UPDATE problems SET title=?, description=?, status=?, root_cause=?, workaround=?, assignee_id=?, updated_at=? WHERE id=?`)
    .run(
      parsed.data.title ?? problem.title,
      parsed.data.description ?? problem.description,
      parsed.data.status ?? problem.status,
      parsed.data.rootCause ?? problem.root_cause,
      parsed.data.workaround ?? problem.workaround,
      parsed.data.assigneeId !== undefined ? parsed.data.assigneeId : problem.assignee_id,
      now, id
    );
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const problem = db.prepare("SELECT * FROM problems WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!problem) return Response.json({ error: "Problema não encontrado." }, { status: 404 });
  const accessError = assertBranchAccess(auth.user, problem.branch_id);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  const linked = db.prepare("SELECT COUNT(*) count FROM tickets WHERE problem_id=?").get(id).count;
  if (linked > 0) return Response.json({ error: "Problema com chamados vinculados não pode ser excluído." }, { status: 409 });
  db.prepare("DELETE FROM problems WHERE id=?").run(id);
  return Response.json({ ok: true });
}
