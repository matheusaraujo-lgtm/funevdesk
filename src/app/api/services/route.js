import { requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().default(""),
  ticketTypeId: z.string().min(1),
  slaHours: z.number().int().min(1).max(720).optional(),
  requiresApproval: z.boolean().optional().default(false),
});

export function listServices(db, organizationId) {
  return db.prepare(`
    SELECT s.*, tt.name ticket_type_name
    FROM services s LEFT JOIN ticket_types tt ON tt.id=s.ticket_type_id
    WHERE s.organization_id=? ORDER BY s.active DESC, s.name
  `).all(organizationId).map((s) => ({ ...s, active: Boolean(s.active), requiresApproval: Boolean(s.requires_approval) }));
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  return Response.json({ services: listServices(getDb(), auth.user.organization_id) });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "ADMIN") return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const id = makeId("svc");
  db.prepare(`INSERT INTO services (id, organization_id, ticket_type_id, name, description, sla_hours, requires_approval, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`)
    .run(id, auth.user.organization_id, parsed.data.ticketTypeId, parsed.data.name, parsed.data.description, parsed.data.slaHours || null, parsed.data.requiresApproval ? 1 : 0, new Date().toISOString());
  return Response.json({ services: listServices(db, auth.user.organization_id) }, { status: 201 });
}
