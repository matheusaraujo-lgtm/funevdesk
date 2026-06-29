import crypto from "node:crypto";
import { makeId } from "@/lib/db";

export const NEXUS_REMOTE_PROVIDER = "NEXUS_WEBRTC";

export function createRemoteSession(db, {
  organizationId,
  assetId,
  ticketId,
  requestedBy,
  requestedByName,
  provider = NEXUS_REMOTE_PROVIDER,
  launchUrl,
}) {
  const now = new Date();
  const sessionId = makeId("rmt");
  // Segredo por sessão: liga o console WebRTC ao técnico que iniciou (defesa
  // contra hijack/IDOR de sessões remotas por outros usuários da organização).
  const sessionSecret = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO remote_sessions
      (id, organization_id, asset_id, ticket_id, requested_by, requested_by_name, status, provider, provider_node_id, launch_url, consent_required, created_at, expires_at, session_secret)
    VALUES (?, ?, ?, ?, ?, ?, 'REQUESTED', ?, NULL, ?, 1, ?, ?, ?)
  `).run(
    sessionId,
    organizationId,
    assetId,
    ticketId || null,
    requestedBy,
    requestedByName,
    provider,
    launchUrl,
    now.toISOString(),
    expiresAt,
    sessionSecret,
  );
  return { sessionId, expiresAt, launchUrl, sessionSecret };
}

// Comparação em tempo constante do segredo da sessão.
export function verifyRemoteSecret(session, provided) {
  if (!session?.session_secret || !provided) return false;
  const a = Buffer.from(String(session.session_secret));
  const b = Buffer.from(String(provided));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function appendRemoteSignal(db, sessionId, role, payload) {
  const id = makeId("sig");
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO remote_signal_messages (id, session_id, role, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, sessionId, role, JSON.stringify(payload), createdAt);
  return { id, createdAt };
}

export function listRemoteSignals(db, sessionId, since, forRole) {
  const rows = since
    ? db.prepare(`
        SELECT id, role, payload_json, created_at FROM remote_signal_messages
        WHERE session_id=? AND created_at > ? AND role != ?
        ORDER BY created_at ASC
      `).all(sessionId, since, forRole)
    : db.prepare(`
        SELECT id, role, payload_json, created_at FROM remote_signal_messages
        WHERE session_id=? AND role != ?
        ORDER BY created_at ASC
      `).all(sessionId, forRole);
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    payload: JSON.parse(row.payload_json || "{}"),
    createdAt: row.created_at,
  }));
}

export function getActiveRemoteSession(db, sessionId) {
  const now = new Date().toISOString();
  return db.prepare(`
    SELECT rs.*, a.hostname, a.id AS asset_id_ref
    FROM remote_sessions rs
    JOIN assets a ON a.id = rs.asset_id
    WHERE rs.id=? AND (rs.expires_at IS NULL OR rs.expires_at > ?)
      AND rs.status IN ('REQUESTED', 'ACKNOWLEDGED', 'ACTIVE', 'DENIED')
  `).get(sessionId, now);
}
