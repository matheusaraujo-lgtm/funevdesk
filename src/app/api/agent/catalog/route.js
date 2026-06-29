import { getDb } from "@/lib/db";
import { findAssetByToken } from "@/lib/agent";
import { listAgentCatalog } from "@/lib/agent-tickets";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const token = request.headers.get("x-agent-token")?.trim();
  const db = getDb();
  const asset = findAssetByToken(db, token);
  if (!asset) return Response.json({ error: "Agente não autorizado." }, { status: 401 });
  return Response.json({ catalog: listAgentCatalog(db, asset) });
}
