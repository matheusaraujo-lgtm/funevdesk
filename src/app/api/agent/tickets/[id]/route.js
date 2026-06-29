import { getDb } from "@/lib/db";
import { findAssetByToken } from "@/lib/agent";
import { getAgentTicket } from "@/lib/agent-tickets";
import { isTerminalStatusCode } from "@/lib/ticket-statuses";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { id } = await params;
  const token = request.headers.get("x-agent-token")?.trim();
  const db = getDb();
  const asset = findAssetByToken(db, token);
  if (!asset) return Response.json({ error: "Agente não autorizado." }, { status: 401 });

  const ticket = getAgentTicket(db, asset, id);
  if (!ticket) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });

  return Response.json({
    ticket: {
      id: ticket.id,
      number: ticket.number,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      source: ticket.source,
      ticketTypeName: ticket.ticket_type_name,
      assigneeName: ticket.assignee_name,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      resolved: isTerminalStatusCode(db, ticket.organization_id, ticket.status),
    },
  });
}
