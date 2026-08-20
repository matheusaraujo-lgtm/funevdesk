import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  branchId: z.string().min(1).optional(),
  title: z.string().min(3).max(160).optional(),
  description: z.string().min(5).max(5000).optional(),
  ticketTypeId: z.string().min(1).optional(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]).optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
  recurrenceUnit: z.enum(["DAYS", "WEEKS", "MONTHS"]).optional(),
  recurrenceInterval: z.number().int().min(1).max(365).optional(),
  nextRunAt: z.string().datetime().optional(),
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

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = requirePermission(request, "recurring_tickets", "update");
  if (auth.error) return auth.error;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const db = getDb();
  const orgId = auth.user.organization_id;
  const row = db.prepare("SELECT * FROM recurring_tickets WHERE id=? AND organization_id=?").get(id, orgId);
  if (!row) return Response.json({ error: "Modelo não encontrado." }, { status: 404 });

  if (data.branchId) {
    if (!auth.user.all_branches && !auth.user.branchIds.includes(data.branchId)) {
      return Response.json({ error: "Você não possui permissão para esta unidade." }, { status: 403 });
    }
    const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(data.branchId, orgId);
    if (!branch) return Response.json({ error: "Unidade não encontrada." }, { status: 404 });
  }
  if (data.ticketTypeId) {
    const ticketType = db.prepare("SELECT id FROM ticket_types WHERE id=? AND organization_id=? AND active=1").get(data.ticketTypeId, orgId);
    if (!ticketType) return Response.json({ error: "Tipo de chamado não encontrado ou inativo." }, { status: 404 });
  }

  db.prepare(`
    UPDATE recurring_tickets SET
      branch_id = COALESCE(?, branch_id),
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      ticket_type_id = COALESCE(?, ticket_type_id),
      priority = COALESCE(?, priority),
      assignee_id = ?,
      team_id = ?,
      recurrence_unit = COALESCE(?, recurrence_unit),
      recurrence_interval = COALESCE(?, recurrence_interval),
      next_run_at = COALESCE(?, next_run_at),
      active = COALESCE(?, active),
      updated_at = ?
    WHERE id=?
  `).run(
    data.branchId ?? null,
    data.title ?? null,
    data.description ?? null,
    data.ticketTypeId ?? null,
    data.priority ?? null,
    data.assigneeId !== undefined ? (data.assigneeId || null) : row.assignee_id,
    data.teamId !== undefined ? (data.teamId || null) : row.team_id,
    data.recurrenceUnit ?? null,
    data.recurrenceInterval ?? null,
    data.nextRunAt ?? null,
    data.active !== undefined ? (data.active ? 1 : 0) : null,
    new Date().toISOString(),
    id,
  );

  return Response.json({ templates: listFor(db, orgId) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requirePermission(request, "recurring_tickets", "delete");
  if (auth.error) return auth.error;
  const db = getDb();
  const row = db.prepare("SELECT id FROM recurring_tickets WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!row) return Response.json({ error: "Modelo não encontrado." }, { status: 404 });
  db.prepare("DELETE FROM recurring_tickets WHERE id=?").run(id);
  return Response.json({ templates: listFor(db, auth.user.organization_id) });
}
