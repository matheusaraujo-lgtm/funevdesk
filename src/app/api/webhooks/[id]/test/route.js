import crypto from "crypto";
import { can, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertSafeOutboundUrl } from "@/lib/security";

export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 10000;

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "webhooks", "update")) return Response.json({ error: "Sem permissão." }, { status: 403 });

  const db = getDb();
  const hook = db.prepare("SELECT * FROM webhooks WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!hook) return Response.json({ error: "Webhook não encontrado." }, { status: 404 });

  const payload = {
    event: "WEBHOOK_TEST",
    timestamp: new Date().toISOString(),
    data: {
      message: "Evento de teste do FunevDesk.",
      organizationId: auth.user.organization_id,
      triggeredBy: auth.user.name,
    },
  };
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "NexusDesk-Webhooks/1.0",
  };
  if (hook.secret) {
    const signature = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
    headers["X-Nexus-Signature"] = `sha256=${signature}`;
  }

  try {
    await assertSafeOutboundUrl(hook.url);
    const response = await fetch(hook.url, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return Response.json({
        ok: false,
        error: `O destino respondeu HTTP ${response.status}.`,
        status: response.status,
      }, { status: 502 });
    }
    return Response.json({ ok: true, status: response.status });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error.message || "Não foi possível contactar o destino.",
    }, { status: 502 });
  }
}
