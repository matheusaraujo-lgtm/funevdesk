import { requireCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getDb, makeId } from "@/lib/db";
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

const ruleSchema = z.object({
  name: z.string().min(2).max(80),
  active: z.boolean().optional().default(true),
  conditions: conditionsSchema.optional().default({}),
  actions: actionsSchema.optional().default({}),
});

// Remove chaves vazias para guardar JSON enxuto.
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

// Listas de apoio para o editor (equipes, tipos, técnicos, categorias) — mantém a tela autossuficiente.
function options(db, orgId) {
  return {
    teams: db.prepare("SELECT id, name FROM teams WHERE organization_id=? ORDER BY name").all(orgId),
    ticketTypes: db.prepare("SELECT id, name FROM ticket_types WHERE organization_id=? ORDER BY name").all(orgId),
    technicians: db.prepare("SELECT id, name FROM users WHERE organization_id=? AND active=1 AND role IN ('ADMIN','TECHNICIAN') ORDER BY name").all(orgId),
    categories: db.prepare("SELECT DISTINCT category FROM ticket_types WHERE organization_id=? AND category IS NOT NULL ORDER BY category").all(orgId).map((row) => row.category),
  };
}

export async function GET(request) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;
  const db = getDb();
  const orgId = auth.user.organization_id;
  const rows = db.prepare("SELECT * FROM automation_rules WHERE organization_id=? ORDER BY position, created_at").all(orgId);
  const rules = rows.map((row) => ({
    id: row.id,
    name: row.name,
    active: Boolean(row.active),
    position: row.position,
    conditions: safeParse(row.conditions_json),
    actions: safeParse(row.actions_json),
  }));
  return Response.json({ rules, ...options(db, orgId) });
}

export async function POST(request) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;
  const parsed = ruleSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Revise os dados da regra." }, { status: 400 });
  const conditions = clean(parsed.data.conditions);
  const actions = clean(parsed.data.actions);
  if (!Object.keys(actions).length) return Response.json({ error: "Defina ao menos uma ação (equipe ou responsável)." }, { status: 400 });
  const db = getDb();
  const orgId = auth.user.organization_id;
  const id = makeId("aut");
  const now = new Date().toISOString();
  const nextPosition = db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM automation_rules WHERE organization_id=?").get(orgId).next;
  db.prepare(`INSERT INTO automation_rules (id, organization_id, name, active, position, conditions_json, actions_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, orgId, parsed.data.name, parsed.data.active ? 1 : 0, nextPosition, JSON.stringify(conditions), JSON.stringify(actions), now);
  logAudit(db, { organizationId: orgId, branchId: null, actorId: auth.user.id, actorName: auth.user.name, entityType: "automation_rule", entityId: id, action: "CREATE", details: parsed.data.name });
  return Response.json({ id }, { status: 201 });
}

function safeParse(json) {
  try { return JSON.parse(json || "{}"); } catch { return {}; }
}
