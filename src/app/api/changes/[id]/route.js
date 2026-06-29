import { requireCurrentUser, getPermissions } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/branch-scope";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum(["SOLICITADO", "ANALISE", "APROVADO", "IMPLEMENTANDO", "CONCLUIDO", "REJEITADO"]).optional(),
  title: z.string().min(5).max(160).optional(),
  description: z.string().min(5).max(5000).optional(),
  changeType: z.enum(["NORMAL", "STANDARD", "EMERGENCY"]).optional(),
  risk: z.enum(["BAIXO", "MEDIO", "ALTO"]).optional(),
  plannedStart: z.string().nullable().optional(),
  plannedEnd: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  approverId: z.string().nullable().optional(),
});

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const change = db.prepare("SELECT * FROM changes WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!change) return Response.json({ error: "Mudança não encontrada." }, { status: 404 });
  const accessError = assertBranchAccess(auth.user, change.branch_id);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  const data = parsed.data;
  if (data.assigneeId) {
    const assignee = db.prepare("SELECT id FROM users WHERE id=? AND organization_id=?").get(data.assigneeId, auth.user.organization_id);
    if (!assignee) return Response.json({ error: "Responsável inválido." }, { status: 400 });
  }
  if (data.approverId) {
    const approver = db.prepare("SELECT id FROM users WHERE id=? AND organization_id=? AND active=1").get(data.approverId, auth.user.organization_id);
    if (!approver) return Response.json({ error: "Aprovador inválido." }, { status: 400 });
  }
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE changes SET status=?, title=?, description=?, change_type=?, risk=?, planned_start=?, planned_end=?, assignee_id=?, updated_at=? WHERE id=?")
      .run(
        data.status ?? change.status,
        data.title ?? change.title,
        data.description ?? change.description,
        data.changeType ?? change.change_type,
        data.risk ?? change.risk,
        data.plannedStart !== undefined ? (data.plannedStart || null) : change.planned_start,
        data.plannedEnd !== undefined ? (data.plannedEnd || null) : change.planned_end,
        data.assigneeId !== undefined ? (data.assigneeId || null) : change.assignee_id,
        now,
        id,
      );
    if (data.approverId !== undefined) {
      const current = db.prepare("SELECT id, approver_id FROM change_approvals WHERE change_id=? AND status='PENDENTE'").get(id);
      if (!data.approverId) {
        db.prepare("DELETE FROM change_approvals WHERE change_id=? AND status='PENDENTE'").run(id);
      } else if (!current) {
        db.prepare("INSERT INTO change_approvals (id, change_id, approver_id, status, requested_at) VALUES (?, ?, ?, 'PENDENTE', ?)")
          .run(makeId("cap"), id, data.approverId, now);
      } else if (current.approver_id !== data.approverId) {
        db.prepare("UPDATE change_approvals SET approver_id=?, requested_at=? WHERE id=?").run(data.approverId, now, current.id);
      }
    }
  })();
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canManageTickets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const change = db.prepare("SELECT * FROM changes WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!change) return Response.json({ error: "Mudança não encontrada." }, { status: 404 });
  const accessError = assertBranchAccess(auth.user, change.branch_id);
  if (accessError) return Response.json({ error: accessError.message }, { status: 403 });
  if (change.status === "IMPLEMENTANDO" || change.status === "CONCLUIDO") {
    return Response.json({ error: "Mudanças em implementação ou concluídas não podem ser excluídas." }, { status: 409 });
  }
  db.transaction(() => {
    db.prepare("DELETE FROM change_approvals WHERE change_id=?").run(id);
    db.prepare("DELETE FROM changes WHERE id=?").run(id);
  })();
  return Response.json({ ok: true });
}
