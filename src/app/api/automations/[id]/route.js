import { requireCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const conditionsSchema = z.object({
  priority: z.enum(["CRITICA", "ALTA", "MEDIA", "BAIXA"]).optional(),
  category: z.string().max(80).optional(),
  ticketTypeId: z.string().max(80).optional(),
  kind: z.enum(["INCIDENTE", "REQUISICAO"]).optional(),
}).partial();

const actionsSchema = z.object({
  teamId: z.string().max(80).optional(),
  assigneeId: z.string().max(80).optional(),
}).partial();

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  active: z.boolean().optional(),
  conditions: conditionsSchema.optional(),
  actions: actionsSchema.optional(),
});

function clean(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return out;
}

function requireAdmin(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth;
  if (auth.user.role !== "ADMIN") return { error: Response.json({ error: "Acesso restrito a administradores." }, { status: 403 }) };
  return auth;
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Revise os dados da regra." }, { status: 400 });
  const db = getDb();
  const orgId = auth.user.organization_id;
  const rule = db.prepare("SELECT * FROM automation_rules WHERE id=? AND organization_id=?").get(id, orgId);
  if (!rule) return Response.json({ error: "Regra não encontrada." }, { status: 404 });

  const sets = [];
  const values = [];
  if (parsed.data.name !== undefined) { sets.push("name=?"); values.push(parsed.data.name); }
  if (parsed.data.active !== undefined) { sets.push("active=?"); values.push(parsed.data.active ? 1 : 0); }
  if (parsed.data.conditions !== undefined) { sets.push("conditions_json=?"); values.push(JSON.stringify(clean(parsed.data.conditions))); }
  if (parsed.data.actions !== undefined) {
    const actions = clean(parsed.data.actions);
    if (!Object.keys(actions).length) return Response.json({ error: "Defina ao menos uma ação (equipe ou responsável)." }, { status: 400 });
    sets.push("actions_json=?"); values.push(JSON.stringify(actions));
  }
  if (!sets.length) return Response.json({ ok: true });
  values.push(id, orgId);
  db.prepare(`UPDATE automation_rules SET ${sets.join(", ")} WHERE id=? AND organization_id=?`).run(...values);
  logAudit(db, { organizationId: orgId, branchId: null, actorId: auth.user.id, actorName: auth.user.name, entityType: "automation_rule", entityId: id, action: "UPDATE", details: rule.name });
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;
  const db = getDb();
  const orgId = auth.user.organization_id;
  const rule = db.prepare("SELECT name FROM automation_rules WHERE id=? AND organization_id=?").get(id, orgId);
  if (!rule) return Response.json({ error: "Regra não encontrada." }, { status: 404 });
  db.prepare("DELETE FROM automation_rules WHERE id=? AND organization_id=?").run(id, orgId);
  logAudit(db, { organizationId: orgId, branchId: null, actorId: auth.user.id, actorName: auth.user.name, entityType: "automation_rule", entityId: id, action: "DELETE", details: rule.name });
  return Response.json({ ok: true });
}
