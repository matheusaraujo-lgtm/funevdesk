import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { getAllowedBranchIds } from "@/lib/branch-scope";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  branchId: z.string().min(1),
  title: z.string().min(3).max(160),
  description: z.string().min(5).max(5000),
  ticketTypeId: z.string().min(1),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]).optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
  recurrenceUnit: z.enum(["DAYS", "WEEKS", "MONTHS"]),
  recurrenceInterval: z.number().int().min(1).max(365),
  startAt: z.string().datetime(),
  active: z.boolean().optional(),
});

function listFor(db, organizationId) {
  return db.prepare(`
    SELECT r.*, b.name branch_name, tt.name ticket_type_name, u.name assignee_name, t.name team_name
    FROM recurring_tickets r
    JOIN branches b ON b.id = r.branch_id
    LEFT JOIN ticket_types tt ON tt.id = r.ticket_type_id
    LEFT JOIN users u ON u.id = r.assignee_id
    LEFT JOIN teams t ON t.id = r.team_id
    WHERE r.organization_id=?
    ORDER BY r.created_at DESC
  `).all(organizationId);
}

// Isolamento por unidade: só quem tem acesso a todas as unidades vê modelos de outras filiais.
function scopeTemplates(templates, auth, db, requestedBranchId) {
  const scopedBranchIds = getAllowedBranchIds(auth.user, db, requestedBranchId || null);
  if (!auth.user.all_branches) return templates.filter((t) => scopedBranchIds.includes(t.branch_id));
  if (requestedBranchId) return templates.filter((t) => t.branch_id === requestedBranchId);
  return templates;
}

export async function GET(request) {
  const auth = requirePermission(request, "recurring_tickets", "read");
  if (auth.error) return auth.error;
  const db = getDb();
  const requestedBranchId = new URL(request.url).searchParams.get("branchId");
  const templates = scopeTemplates(listFor(db, auth.user.organization_id), auth, db, requestedBranchId);
  return Response.json({ templates });
}

export async function POST(request) {
  const auth = requirePermission(request, "recurring_tickets", "create");
  if (auth.error) return auth.error;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const db = getDb();
  const orgId = auth.user.organization_id;
  if (!auth.user.all_branches && !auth.user.branchIds.includes(data.branchId)) {
    return Response.json({ error: "Você não possui permissão para esta unidade." }, { status: 403 });
  }
  const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(data.branchId, orgId);
  if (!branch) return Response.json({ error: "Unidade não encontrada." }, { status: 404 });
  const ticketType = db.prepare("SELECT id FROM ticket_types WHERE id=? AND organization_id=? AND active=1").get(data.ticketTypeId, orgId);
  if (!ticketType) return Response.json({ error: "Tipo de chamado não encontrado ou inativo." }, { status: 404 });

  const now = new Date().toISOString();
  const id = makeId("rct");
  db.prepare(`
    INSERT INTO recurring_tickets
      (id, organization_id, branch_id, title, description, ticket_type_id, priority, assignee_id, team_id,
       recurrence_unit, recurrence_interval, next_run_at, active, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, orgId, data.branchId, data.title, data.description, data.ticketTypeId, data.priority || "MEDIA",
    data.assigneeId || null, data.teamId || null, data.recurrenceUnit, data.recurrenceInterval, data.startAt,
    data.active === false ? 0 : 1, auth.user.id, now, now,
  );

  return Response.json({ templates: scopeTemplates(listFor(db, orgId), auth, db, null) }, { status: 201 });
}
