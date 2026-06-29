import { getDb } from "@/lib/db";
import { findAssetByToken } from "@/lib/agent";
import { listAgentNotifications } from "@/lib/agent-tickets";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const token = request.headers.get("x-agent-token")?.trim();
  const db = getDb();
  const asset = findAssetByToken(db, token);
  if (!asset) return Response.json({ error: "Agente não autorizado." }, { status: 401 });

  const since = new URL(request.url).searchParams.get("since") || "";
  const notifications = listAgentNotifications(db, asset, since || null);
  return Response.json({ notifications });
}
