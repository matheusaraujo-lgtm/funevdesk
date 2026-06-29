import { getDb } from "@/lib/db";
import { findAssetByToken } from "@/lib/agent";
import { getAgentTicket, listAgentTicketMessages } from "@/lib/agent-tickets";
import { isTerminalStatusCode } from "@/lib/ticket-statuses";
import { createNotification } from "@/lib/notifications";
import { dispatchWebhooks } from "@/lib/webhooks";
import { makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

function getContext(request, ticketId) {
  const db = getDb();
  const token = request.headers.get("x-agent-token")?.trim();
  const asset = findAssetByToken(db, token);
  const ticket = asset ? getAgentTicket(db, asset, ticketId) : null;
  return { db, asset, ticket };
}

export async function GET(request, { params }) {
  const { id } = await params;
  const { asset, ticket } = getContext(request, id);
  if (!asset || !ticket) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const messages = listAgentTicketMessages(getDb(), ticket);
  const resolved = isTerminalStatusCode(getDb(), ticket.organization_id, ticket.status);
  return Response.json({ messages, resolved });
}

export async function POST(request, { params }) {
  const { id } = await params;
  const { db, asset, ticket } = getContext(request, id);
  if (!asset || !ticket) return Response.json({ error: "Não autorizado." }, { status: 401 });
  if (isTerminalStatusCode(db, ticket.organization_id, ticket.status)) {
    return Response.json({ error: "Este chamado já foi resolvido." }, { status: 409 });
  }

  const parsed = z.object({ body: z.string().min(1).max(4000) }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Mensagem inválida." }, { status: 400 });

  const now = new Date().toISOString();
  const authorName = asset.logged_user?.includes("\\")
    ? asset.logged_user.split("\\").pop()
    : (asset.logged_user || asset.hostname);
  const messageId = makeId("msg");

  db.transaction(() => {
    db.prepare("INSERT INTO ticket_messages (id, ticket_id, author_id, author_name, body, visibility, created_at) VALUES (?, ?, NULL, ?, ?, 'PUBLIC', ?)")
      .run(messageId, id, authorName, parsed.data.body, now);
    db.prepare("UPDATE tickets SET updated_at=? WHERE id=?").run(now, id);
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, NULL, ?, 'MESSAGE', ?, ?)")
      .run(makeId("evt"), id, authorName, "Mensagem enviada pelo agente do usuário.", now);
  })();

  if (ticket.assignee_id) {
    createNotification(db, {
      organizationId: ticket.organization_id,
      userId: ticket.assignee_id,
      eventType: "TICKET_MESSAGE",
      title: `Chamado #${ticket.number}`,
      body: parsed.data.body.slice(0, 200),
      referenceId: id,
      referenceType: "TICKET",
    });
  }

  dispatchWebhooks(db, ticket.organization_id, "TICKET_MESSAGE", {
    id: messageId,
    ticketId: id,
    ticketNumber: ticket.number,
    authorName,
    body: parsed.data.body,
    visibility: "PUBLIC",
    source: "AGENT",
  });

  return Response.json({ ok: true }, { status: 201 });
}
