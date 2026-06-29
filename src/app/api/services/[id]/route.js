import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listServices } from "../route";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  slaHours: z.number().int().min(1).max(720).nullable().optional(),
  requiresApproval: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "ADMIN") return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const service = db.prepare("SELECT * FROM services WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!service) return Response.json({ error: "Serviço não encontrado." }, { status: 404 });
  db.prepare(`UPDATE services SET name=?, description=?, sla_hours=?, requires_approval=?, active=? WHERE id=?`)
    .run(
      parsed.data.name ?? service.name,
      parsed.data.description ?? service.description,
      parsed.data.slaHours !== undefined ? parsed.data.slaHours : service.sla_hours,
      parsed.data.requiresApproval !== undefined ? (parsed.data.requiresApproval ? 1 : 0) : service.requires_approval,
      parsed.data.active !== undefined ? (parsed.data.active ? 1 : 0) : service.active,
      id
    );
  return Response.json({ services: listServices(db, auth.user.organization_id) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "ADMIN") return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const db = getDb();
  const linked = db.prepare("SELECT COUNT(*) count FROM tickets WHERE service_id=?").get(id).count;
  if (linked > 0) return Response.json({ error: "Serviço com chamados vinculados não pode ser excluído." }, { status: 409 });
  db.prepare("DELETE FROM services WHERE id=? AND organization_id=?").run(id, auth.user.organization_id);
  return Response.json({ services: listServices(db, auth.user.organization_id) });
}
