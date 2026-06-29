import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { explainTicketAI } from "@/lib/deepseek";

export const dynamic = "force-dynamic";

/**
 * Explicação sob demanda do chamado (botão "Explicar / Como resolver").
 * Usa o motor de inteligência (regras) e refina com DeepSeek quando há chave.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!getPermissions(currentUser).canManageTickets) {
    return Response.json({ error: "Apenas a equipe de suporte pode usar o analista." }, { status: 403 });
  }

  const ticket = db.prepare(`
    SELECT t.id, t.organization_id, t.branch_id, t.title, t.description, t.category, t.priority, t.source,
           a.hostname, a.os_name, a.cpu_percent, a.memory_percent, a.disk_percent, a.ip_address
    FROM tickets t
    LEFT JOIN assets a ON a.id = t.asset_id
    WHERE t.id = ?
  `).get(id);

  if (!ticket || ticket.organization_id !== currentUser.organization_id) {
    return Response.json({ error: "Chamado não encontrado." }, { status: 404 });
  }
  if (!getPermissions(currentUser).canViewAllBranches && !currentUser.branchIds?.includes(ticket.branch_id)) {
    return Response.json({ error: "Você não tem acesso a este chamado." }, { status: 403 });
  }

  const insight = await explainTicketAI(ticket, {
    hostname: ticket.hostname,
    os_name: ticket.os_name,
    cpu_percent: ticket.cpu_percent,
    memory_percent: ticket.memory_percent,
    disk_percent: ticket.disk_percent,
  });

  return Response.json({ insight });
}
