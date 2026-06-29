import { requireCurrentUser, getPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { assertBranchAccess, branchFilterClause, getAllowedBranchIds } from "@/lib/branch-scope";
import { getDb, makeId } from "@/lib/db";
import { dispatchWebhooks } from "@/lib/webhooks";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().min(5).max(160),
  description: z.string().min(5).max(5000),
  branchId: z.string().min(1),
  assigneeId: z.string().nullable().optional(),
  workaround: z.string().max(2000).optional().default(""),
});

export function listProblems(db, organizationId, branchIds = null) {
  const scope = branchIds?.length ? branchFilterClause(branchIds, "p.branch_id") : { clause: "1=1", params: [] };
  return db.prepare(`
    SELECT p.*, u.name assignee_name, b.name branch_name,
      (SELECT COUNT(*) FROM tickets t WHERE t.problem_id=p.id) incident_count
    FROM problems p
    LEFT JOIN users u ON u.id=p.assignee_id
    LEFT JOIN branches b ON b.id=p.branch_id
    WHERE p.organization_id=? AND (${scope.clause} OR p.branch_id IS NULL)
    ORDER BY p.updated_at DESC
  `).all(organizationId, ...scope.params);
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const requestedBranchId = new URL(request.url).searchParams.get("branchId");
  const scopedBranchIds = getAllowedBranchIds(auth.user, db, requestedBranchId || null);
  return Response.json({ problems: listProblems(db, auth.user.organization_id, scopedBranchIds) });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const accessError = assertBranchAccess(auth.user, parsed.data.branchId);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  const db = getDb();
  const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(parsed.data.branchId, auth.user.organization_id);
  if (!branch) return Response.json({ error: "Unidade inválida." }, { status: 400 });
  const number = db.prepare("SELECT COALESCE(MAX(number), 100)+1 next FROM problems").get().next;
  const id = makeId("prb");
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO problems (id, organization_id, branch_id, number, title, description, status, workaround, assignee_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'ABERTO', ?, ?, ?, ?)`)
    .run(id, auth.user.organization_id, parsed.data.branchId, number, parsed.data.title, parsed.data.description, parsed.data.workaround || "", parsed.data.assigneeId || null, now, now);
  logAudit(db, { organizationId: auth.user.organization_id, branchId: parsed.data.branchId, actorId: auth.user.id, actorName: auth.user.name, entityType: "problem", entityId: id, action: "CREATE", details: parsed.data.title });
  dispatchWebhooks(db, auth.user.organization_id, "PROBLEM_CREATED", {
    id,
    number,
    title: parsed.data.title,
    status: "ABERTO",
    assigneeId: parsed.data.assigneeId || null,
  });
  return Response.json({ problems: listProblems(db, auth.user.organization_id, getAllowedBranchIds(auth.user, db)) }, { status: 201 });
}
