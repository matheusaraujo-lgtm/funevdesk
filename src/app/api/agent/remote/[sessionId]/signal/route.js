import { findAssetByToken } from "@/lib/agent";
import { getDb } from "@/lib/db";
import { appendRemoteSignal, getActiveRemoteSession, listRemoteSignals } from "@/lib/nexus-remote";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { sessionId } = await params;
  const token = request.headers.get("x-agent-token")?.trim();
  if (!token) return Response.json({ error: "Token do agente ausente." }, { status: 401 });

  const db = getDb();
  const asset = findAssetByToken(db, token);
  if (!asset) return Response.json({ error: "Agente não autorizado." }, { status: 401 });

  const session = getActiveRemoteSession(db, sessionId);
  if (!session || session.asset_id !== asset.id) {
    return Response.json({ error: "Sessão não encontrada." }, { status: 404 });
  }

  const since = new URL(request.url).searchParams.get("since") || "";
  const signals = listRemoteSignals(db, sessionId, since, "agent");
  return Response.json({ signals });
}

export async function POST(request, { params }) {
  const { sessionId } = await params;
  const token = request.headers.get("x-agent-token")?.trim();
  if (!token) return Response.json({ error: "Token do agente ausente." }, { status: 401 });

  const db = getDb();
  const asset = findAssetByToken(db, token);
  if (!asset) return Response.json({ error: "Agente não autorizado." }, { status: 401 });

  const session = getActiveRemoteSession(db, sessionId);
  if (!session || session.asset_id !== asset.id) {
    return Response.json({ error: "Sessão não encontrada." }, { status: 404 });
  }

  const body = await request.json();
  if (!body?.type) return Response.json({ error: "Payload inválido." }, { status: 400 });

  const signal = appendRemoteSignal(db, sessionId, "agent", body);
  return Response.json({ ok: true, signalId: signal.id, createdAt: signal.createdAt });
}
