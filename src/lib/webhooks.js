import crypto from "crypto";
import { assertSafeOutboundUrl } from "@/lib/security";

const REQUEST_TIMEOUT_MS = 10000;

function parseEvents(eventsJson) {
  try {
    const events = JSON.parse(eventsJson || "[]");
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

export async function deliverWebhook(hook, eventType, payload) {
  // Bloqueia SSRF: resolve e rejeita destinos internos/loopback/link-local.
  await assertSafeOutboundUrl(hook.url);

  const timestamp = new Date().toISOString();
  const body = JSON.stringify({
    event: eventType,
    timestamp,
    data: payload,
  });
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "NexusDesk-Webhooks/1.0",
    "X-Nexus-Timestamp": timestamp,
  };
  if (hook.secret) {
    // Assina timestamp + body para permitir verificação de freshness/replay no receptor.
    const signature = crypto.createHmac("sha256", hook.secret).update(`${timestamp}.${body}`).digest("hex");
    headers["X-Nexus-Signature"] = `sha256=${signature}`;
  }
  const response = await fetch(hook.url, {
    method: "POST",
    headers,
    body,
    redirect: "manual", // evita bypass do anti-SSRF via redirect para host interno
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao entregar webhook ${hook.id}`);
  }
}

export function dispatchWebhooks(db, organizationId, eventType, payload) {
  const hooks = db.prepare("SELECT id, name, url, events_json, secret FROM webhooks WHERE organization_id=? AND active=1").all(organizationId);
  hooks
    .filter((hook) => parseEvents(hook.events_json).includes(eventType))
    .forEach((hook) => {
      deliverWebhook(hook, eventType, payload).catch((error) => {
        console.error(`[webhook] Falha ao enviar "${eventType}" para ${hook.name} (${hook.url}):`, error.message);
      });
    });
}
