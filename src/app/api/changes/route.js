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
  changeType: z.enum(["NORMAL", "STANDARD", "EMERGENCY"]).default("NORMAL"),
  risk: z.enum(["BAIXO", "MEDIO", "ALTO"]).default("MEDIO"),
  plannedStart: z.string().nullable().optional(),
  plannedEnd: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  approverId: z.string().nullable().optional(),
});

export function listChanges(db, organizationId, branchIds = null) {
  const scope = branchIds?.length ? branchFilterClause(branchIds, "c.branch_id") : { clause: "1=1", params: [] };
  return db.prepare(`
    SELECT c.*, u.name assignee_name, b.name branch_name
    FROM changes c
    LEFT JOIN users u ON u.id=c.assignee_id
    LEFT JOIN branches b ON b.id=c.branch_id
    WHERE c.organization_id=? AND (${scope.clause} OR c.branch_id IS NULL)
    ORDER BY c.updated_at DESC
  `).all(organizationId, ...scope.params);
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const requestedBranchId = new URL(request.url).searchParams.get("branchId");
  const scopedBranchIds = getAllowedBranchIds(auth.user, db, requestedBranchId || null);
  return Response.json({ changes: listChanges(db, auth.user.organization_id, scopedBranchIds) });
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
  const number = db.prepare("SELECT COALESCE(MAX(number), 100)+1 next FROM changes").get().next;
  const id = makeId("chg");
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`INSERT INTO changes (id, organization_id, branch_id, number, title, description, change_type, status, risk, planned_start, planned_end, assignee_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'SOLICITADO', ?, ?, ?, ?, ?, ?)`)
      .run(id, auth.user.organization_id, parsed.data.branchId, number, parsed.data.title, parsed.data.description, parsed.data.changeType, parsed.data.risk, parsed.data.plannedStart || null, parsed.data.plannedEnd || null, parsed.data.assigneeId || null, now, now);
    if (parsed.data.approverId) {
      db.prepare("INSERT INTO change_approvals (id, change_id, approver_id, status, requested_at) VALUES (?, ?, ?, 'PENDENTE', ?)")
        .run(makeId("cap"), id, parsed.data.approverId, now);
    }
  })();
  logAudit(db, { organizationId: auth.user.organization_id, branchId: parsed.data.branchId, actorId: auth.user.id, actorName: auth.user.name, entityType: "change", entityId: id, action: "CREATE", details: parsed.data.title });
  dispatchWebhooks(db, auth.user.organization_id, "CHANGE_CREATED", {
    id,
    number,
    title: parsed.data.title,
    changeType: parsed.data.changeType,
    risk: parsed.data.risk,
    status: "SOLICITADO",
    assigneeId: parsed.data.assigneeId || null,
  });
  return Response.json({ changes: listChanges(db, auth.user.organization_id, getAllowedBranchIds(auth.user, db)) }, { status: 201 });
}
