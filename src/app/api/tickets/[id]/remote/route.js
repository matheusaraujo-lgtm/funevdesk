import { canAccessTicket, getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { createRemoteSession, NEXUS_REMOTE_PROVIDER } from "@/lib/nexus-remote";

export async function POST(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const settings = db.prepare("SELECT remote_access_enabled FROM system_settings WHERE organization_id=?").get(currentUser.organization_id);
  if (settings && !settings.remote_access_enabled) return Response.json({ error: "O acesso remoto está desativado nas configurações." }, { status: 409 });
  const ticket = db.prepare(`
    SELECT t.*, a.hostname, a.ip_address, a.status asset_status
    FROM tickets t LEFT JOIN assets a ON a.id=t.asset_id WHERE t.id=?
  `).get(id);
  if (!ticket) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });
  if (!canAccessTicket(currentUser, ticket)) return Response.json({ error: "Acesso negado." }, { status: 403 });
  if (!getPermissions(currentUser).canRemoteAccess) return Response.json({ error: "Seu perfil não possui permissão para acesso remoto." }, { status: 403 });
  if (!ticket.hostname) return Response.json({ error: "Nenhuma máquina foi vinculada a este chamado." }, { status: 409 });
  if (ticket.asset_status === "OFFLINE") return Response.json({ error: "O agente está offline. Verifique a última comunicação antes de conectar." }, { status: 409 });

  const origin = new URL(request.url).origin;
  const { sessionId, sessionSecret } = createRemoteSession(db, {
    organizationId: currentUser.organization_id,
    assetId: ticket.asset_id,
    ticketId: ticket.id,
    requestedBy: currentUser.id,
    requestedByName: currentUser.name,
    provider: NEXUS_REMOTE_PROVIDER,
    launchUrl: `${origin}/remote/temp`,
  });
  // O segredo vai no fragmento (#) da URL: o navegador não o envia ao servidor,
  // então não aparece em logs/Referer, mas o console consegue lê-lo no cliente.
  const url = `${origin}/remote/${sessionId}#${sessionSecret}`;
  db.prepare("UPDATE remote_sessions SET launch_url=? WHERE id=?").run(`${origin}/remote/${sessionId}`, sessionId);

  const remoteNow = new Date().toISOString();
  db.prepare(`INSERT INTO audit_logs (id, organization_id, actor_id, actor_name, entity_type, entity_id, action, details, created_at, branch_id)
    VALUES (?, ?, ?, ?, 'TICKET', ?, 'REMOTE_REQUESTED', ?, ?, ?)`)
    .run(makeId("aud"), currentUser.organization_id, currentUser.id, currentUser.name, ticket.id,
      `Sessão remota solicitada para ${ticket.hostname} no chamado #${ticket.number}.`,
      remoteNow, ticket.branch_id);

  // Log de sessão na timeline do chamado (visível na aba Histórico) — auditoria
  // do acesso remoto junto ao atendimento, não só no log global.
  db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'REMOTE_SESSION', ?, ?)")
    .run(makeId("evt"), ticket.id, currentUser.id, currentUser.name, `iniciou uma sessão de acesso remoto em ${ticket.hostname}`, remoteNow);

  return Response.json({
    mode: "nexus-webrtc",
    url,
    sessionId,
    hostname: ticket.hostname,
    notice: "O colaborador deve aceitar no agente. O console abrirá aqui no sistema.",
  });
}
