import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { appendRemoteSignal, getActiveRemoteSession, listRemoteSignals, verifyRemoteSecret } from "@/lib/nexus-remote";

export const dynamic = "force-dynamic";

// Autoriza o lado "viewer" (console do técnico) de uma sessão remota.
// Fecha o IDOR onde qualquer usuário da organização acessava qualquer sessão:
// exige permissão de acesso remoto e ser o solicitante (ou ADMIN). O segredo de sessão
// é defesa-em-profundidade OPCIONAL: se enviado, precisa bater; se ausente, a autorização
// acima (solicitante/ADMIN + canRemoteAccess + organização) já protege. (Ausente = console
// embutido no app; presente = link standalone /remote/<id>#<segredo>.)
function authorizeViewer(request, db, sessionId) {
  const auth = requireCurrentUser(request);
  if (auth.error) return { error: auth.error };
  const session = getActiveRemoteSession(db, sessionId);
  if (!session) return { error: Response.json({ error: "Sessão remota não encontrada ou expirada." }, { status: 404 }) };
  if (session.organization_id !== auth.user.organization_id) {
    return { error: Response.json({ error: "Acesso negado." }, { status: 403 }) };
  }
  if (!getPermissions(auth.user).canRemoteAccess) {
    return { error: Response.json({ error: "Seu perfil não possui permissão para acesso remoto." }, { status: 403 }) };
  }
  const isOwner = session.requested_by === auth.user.id;
  if (!isOwner && auth.user.role !== "ADMIN") {
    return { error: Response.json({ error: "Apenas quem iniciou a sessão pode acessá-la." }, { status: 403 }) };
  }
  const secret = request.headers.get("x-remote-secret") || new URL(request.url).searchParams.get("secret") || "";
  if (secret && !verifyRemoteSecret(session, secret)) {
    return { error: Response.json({ error: "Segredo da sessão inválido." }, { status: 403 }) };
  }
  return { session, user: auth.user };
}

export async function GET(request, { params }) {
  const { sessionId } = await params;
  const db = getDb();
  const ctx = authorizeViewer(request, db, sessionId);
  if (ctx.error) return ctx.error;

  const since = new URL(request.url).searchParams.get("since") || "";
  const signals = listRemoteSignals(db, sessionId, since, "viewer");
  return Response.json({ signals });
}

export async function POST(request, { params }) {
  const { sessionId } = await params;
  const db = getDb();
  const ctx = authorizeViewer(request, db, sessionId);
  if (ctx.error) return ctx.error;

  const body = await request.json();
  if (!body?.type) return Response.json({ error: "Payload inválido." }, { status: 400 });

  const signal = appendRemoteSignal(db, sessionId, "viewer", body);
  if (body.type === "offer" && ctx.session.status === "ACKNOWLEDGED") {
    db.prepare("UPDATE remote_sessions SET status='ACTIVE' WHERE id=?").run(sessionId);
    // Trilha de auditoria: registra quando a sessão remota efetivamente conectou
    // (complementa o "Sessão remota solicitada" gravado na abertura do chamado).
    try {
      db.prepare(`INSERT INTO audit_logs (id, organization_id, actor_id, actor_name, entity_type, entity_id, action, details, created_at, branch_id)
        VALUES (?, ?, ?, ?, 'REMOTE_SESSION', ?, 'REMOTE_CONNECTED', ?, ?, NULL)`)
        .run(makeId("aud"), ctx.user.organization_id, ctx.user.id, ctx.user.name, sessionId,
          `Sessão de acesso remoto estabelecida (conexão ativa) por ${ctx.user.name}.`, new Date().toISOString());
    } catch { /* auditoria não bloqueia a sinalização */ }
  }
  return Response.json({ ok: true, signalId: signal.id, createdAt: signal.createdAt });
}
