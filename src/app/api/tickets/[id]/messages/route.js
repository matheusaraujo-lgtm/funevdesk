import { canAccessTicket, getPermissions, requireCurrentUser } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { getDb, makeId } from "@/lib/db";
import { isRichTextEmpty, plainTextPreview, sanitizeHtml } from "@/lib/rich-text";
import { dispatchWebhooks } from "@/lib/webhooks";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  body: z.string().min(1).max(100000),
  visibility: z.enum(["PUBLIC", "INTERNAL"]).default("PUBLIC"),
  messageType: z.enum(["REPLY", "RESOLUTION"]).default("REPLY"),
});

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const db = getDb();
  const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(id);
  if (!ticket) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });
  if (!canAccessTicket(auth.user, ticket)) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const canSeeInternal = getPermissions(auth.user).canManageTickets;
  const messages = db.prepare("SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY created_at").all(id)
    .filter((m) => m.visibility === "PUBLIC" || canSeeInternal);
  return Response.json({ messages });
}

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Mensagem inválida." }, { status: 400 });
  const db = getDb();
  const ticket = db.prepare("SELECT t.*, u.id requester_user_id FROM tickets t LEFT JOIN users u ON u.id=t.requester_id WHERE t.id=?").get(id);
  if (!ticket) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });
  if (!canAccessTicket(auth.user, ticket)) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const permissions = getPermissions(auth.user);
  if (parsed.data.visibility === "INTERNAL" && !permissions.canManageTickets) {
    return Response.json({ error: "Apenas técnicos podem enviar notas internas." }, { status: 403 });
  }
  if (parsed.data.messageType === "RESOLUTION" && !permissions.canManageTickets) {
    return Response.json({ error: "Apenas técnicos podem registrar resolução." }, { status: 403 });
  }
  const body = sanitizeHtml(parsed.data.body);
  if (isRichTextEmpty(body)) return Response.json({ error: "Informe o conteúdo da mensagem." }, { status: 400 });
  const now = new Date().toISOString();
  const messageId = makeId("msg");
  db.transaction(() => {
    db.prepare(`
      INSERT INTO ticket_messages (id, ticket_id, author_id, author_name, body, visibility, message_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, id, auth.user.id, auth.user.name, body, parsed.data.visibility, parsed.data.messageType, now);
    if (!ticket.first_response_at && permissions.canManageTickets) {
      db.prepare("UPDATE tickets SET first_response_at=?, updated_at=? WHERE id=?").run(now, now, id);
    }
    db.prepare("UPDATE tickets SET updated_at=? WHERE id=?").run(now, id);
    const eventLabel = parsed.data.messageType === "RESOLUTION"
      ? "Resolução registrada na conversa."
      : parsed.data.visibility === "INTERNAL"
        ? "Nota interna adicionada."
        : "Nova mensagem no chamado.";
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'MESSAGE', ?, ?)")
      .run(makeId("evt"), id, auth.user.id, auth.user.name, eventLabel, now);
  })();
  const notifyUserId = auth.user.id === ticket.requester_id ? ticket.assignee_id : ticket.requester_id;
  if (notifyUserId && parsed.data.visibility === "PUBLIC") {
    createNotification(db, {
      organizationId: ticket.organization_id,
      userId: notifyUserId,
      eventType: "TICKET_MESSAGE",
      title: parsed.data.messageType === "RESOLUTION" ? `Chamado #${ticket.number} resolvido` : `Chamado #${ticket.number}`,
      body: plainTextPreview(body, 200),
      referenceId: id,
      referenceType: "TICKET",
    });
  }
  dispatchWebhooks(db, ticket.organization_id, "TICKET_MESSAGE", {
    id: messageId,
    ticketId: id,
    ticketNumber: ticket.number,
    authorId: auth.user.id,
    authorName: auth.user.name,
    body,
    visibility: parsed.data.visibility,
    messageType: parsed.data.messageType,
  });
  return Response.json({ id: messageId }, { status: 201 });
}
