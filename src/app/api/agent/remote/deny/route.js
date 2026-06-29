import { findAssetByToken } from "@/lib/agent";
import { createNotification } from "@/lib/notifications";
import { appendRemoteSignal } from "@/lib/nexus-remote";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

// O agente chama isto quando o COLABORADOR recusa o acesso remoto no popup de consentimento.
// Marca a sessão como recusada, avisa o console (sinal) e notifica quem solicitou (técnico).
export async function POST(request) {
  const token = request.headers.get("x-agent-token")?.trim();
  if (!token) return Response.json({ error: "Token do agente ausente." }, { status: 401 });

  const parsed = z.object({ sessionId: z.string().min(1) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  const db = getDb();
  const asset = findAssetByToken(db, token);
  if (!asset) return Response.json({ error: "Agente não autorizado." }, { status: 401 });

  const session = db.prepare(`
    SELECT id, organization_id, requested_by FROM remote_sessions
    WHERE id=? AND asset_id=? AND status IN ('REQUESTED','ACKNOWLEDGED')
  `).get(parsed.data.sessionId, asset.id);
  if (!session) return Response.json({ error: "Sessão remota não encontrada." }, { status: 404 });

  const now = new Date().toISOString();
  db.prepare("UPDATE remote_sessions SET status='DENIED' WHERE id=?").run(parsed.data.sessionId);
  // Sinal para o console do técnico (se aberto) mostrar a recusa em tempo real.
  appendRemoteSignal(db, parsed.data.sessionId, "agent", { type: "denied", reason: "O colaborador recusou o acesso remoto." });
  // Notificação (sino) para quem solicitou o acesso.
  if (session.requested_by) {
    createNotification(db, {
      organizationId: session.organization_id,
      userId: session.requested_by,
      eventType: "REMOTE_DENIED",
      title: "Acesso remoto recusado",
      body: `O colaborador recusou o acesso remoto em ${asset.hostname}.`,
      referenceId: asset.id,
      referenceType: "ASSET",
    });
  }
  try {
    db.prepare(`INSERT INTO audit_logs (id, organization_id, actor_id, actor_name, entity_type, entity_id, action, details, created_at, branch_id)
      VALUES (?, ?, NULL, ?, 'REMOTE_SESSION', ?, 'REMOTE_DENIED', ?, ?, ?)`)
      .run(makeId("aud"), session.organization_id, asset.hostname, parsed.data.sessionId, `Acesso remoto recusado pelo colaborador em ${asset.hostname}.`, now, asset.branch_id);
  } catch { /* auditoria não bloqueia a recusa */ }

  return Response.json({ ok: true });
}
