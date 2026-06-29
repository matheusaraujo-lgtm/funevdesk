import { findAssetByToken } from "@/lib/agent";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const token = request.headers.get("x-agent-token")?.trim();
  if (!token) return Response.json({ error: "Token do agente ausente." }, { status: 401 });

  const parsed = z.object({ sessionId: z.string().min(1) }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  const db = getDb();
  const asset = findAssetByToken(db, token);
  if (!asset) return Response.json({ error: "Agente não autorizado." }, { status: 401 });

  const session = db.prepare(`
    SELECT id FROM remote_sessions
    WHERE id=? AND asset_id=? AND status='REQUESTED'
      AND (expires_at IS NULL OR expires_at > ?)
  `).get(parsed.data.sessionId, asset.id, new Date().toISOString());

  if (!session) return Response.json({ error: "Sessão remota não encontrada ou expirada." }, { status: 404 });

  db.prepare(`
    UPDATE remote_sessions
    SET agent_acknowledged_at=?, status='ACKNOWLEDGED'
    WHERE id=?
  `).run(new Date().toISOString(), parsed.data.sessionId);

  return Response.json({ ok: true });
}
