import { findAssetByToken, findPendingRemoteSession } from "@/lib/agent";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const token = request.headers.get("x-agent-token")?.trim();
  if (!token) return Response.json({ error: "Token do agente ausente." }, { status: 401 });

  const db = getDb();
  const asset = findAssetByToken(db, token);
  if (!asset) return Response.json({ error: "Agente não autorizado." }, { status: 401 });

  const session = findPendingRemoteSession(db, asset.id);
  return Response.json({ session });
}
