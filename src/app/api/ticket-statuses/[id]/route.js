import { can, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listTicketStatuses } from "@/lib/ticket-statuses";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  label: z.string().min(2).max(80).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isTerminal: z.boolean().optional(),
  pausesSla: z.boolean().optional(),
  allowsMessages: z.boolean().optional(),
  color: z.string().max(20).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "statuses", "update")) return Response.json({ error: "Sem permissão." }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  const db = getDb();
  const row = db.prepare("SELECT * FROM ticket_statuses WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!row) return Response.json({ error: "Status não encontrado." }, { status: 404 });

  db.prepare(`
    UPDATE ticket_statuses SET
      label = COALESCE(?, label),
      sort_order = COALESCE(?, sort_order),
      is_terminal = COALESCE(?, is_terminal),
      pauses_sla = COALESCE(?, pauses_sla),
      allows_messages = COALESCE(?, allows_messages),
      color = COALESCE(?, color),
      active = COALESCE(?, active)
    WHERE id=?
  `).run(
    parsed.data.label ?? null,
    parsed.data.sortOrder ?? null,
    parsed.data.isTerminal !== undefined ? (parsed.data.isTerminal ? 1 : 0) : null,
    parsed.data.pausesSla !== undefined ? (parsed.data.pausesSla ? 1 : 0) : null,
    parsed.data.allowsMessages !== undefined ? (parsed.data.allowsMessages ? 1 : 0) : null,
    parsed.data.color ?? null,
    parsed.data.active !== undefined ? (parsed.data.active ? 1 : 0) : null,
    id,
  );

  return Response.json({ statuses: listTicketStatuses(db, auth.user.organization_id) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "statuses", "delete")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const db = getDb();
  const row = db.prepare("SELECT * FROM ticket_statuses WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!row) return Response.json({ error: "Situação não encontrada." }, { status: 404 });
  // Situações padrão do fluxo não podem ser apagadas (mantêm a integridade do sistema).
  const CORE_STATUS_CODES = ["ABERTO", "EM_ATENDIMENTO", "PENDENTE", "RESOLVIDO"];
  if (CORE_STATUS_CODES.includes(row.code)) return Response.json({ error: "Situações padrão do sistema não podem ser excluídas." }, { status: 409 });
  // Em uso por chamados: bloqueia para não deixar chamados órfãos.
  const inUse = db.prepare("SELECT COUNT(*) AS total FROM tickets WHERE organization_id=? AND status=?").get(auth.user.organization_id, row.code).total;
  if (inUse > 0) return Response.json({ error: `Há ${inUse} chamado(s) com esta situação. Reclassifique-os antes de excluir.` }, { status: 409 });
  db.prepare("DELETE FROM ticket_statuses WHERE id=?").run(id);
  return Response.json({ statuses: listTicketStatuses(db, auth.user.organization_id) });
}
