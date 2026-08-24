import crypto from "crypto";
import { assertSafeOutboundUrl } from "@/lib/security";
import { getDb, makeId } from "@/lib/db";

const REQUEST_TIMEOUT_MS = 10000;
// Tentativas de entrega: imediata, +30s, +2min. Depois disso a entrega fica FAILED no
// histórico (webhook_deliveries) — visível para o admin debugar, em vez de sumir num log.
const RETRY_DELAYS_MS = [0, 30_000, 120_000];

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
    const error = new Error(`HTTP ${response.status} ao entregar webhook ${hook.id}`);
    error.responseStatus = response.status;
    throw error;
  }
  return response.status;
}

// Executa uma tentativa (com atraso do backoff) e agenda a próxima em caso de falha.
// Os retries rodam fora do ciclo da requisição; se o processo reiniciar no meio, a
// entrega fica registrada como PENDING/FAILED no histórico — nunca some em silêncio.
function attemptDelivery(deliveryId, hook, eventType, payload, attemptIndex) {
  const timer = setTimeout(async () => {
    const now = () => new Date().toISOString();
    try {
      const responseStatus = await deliverWebhook(hook, eventType, payload);
      getDb().prepare("UPDATE webhook_deliveries SET status='DELIVERED', attempts=attempts+1, response_status=?, last_error=NULL, completed_at=? WHERE id=?")
        .run(responseStatus, now(), deliveryId);
    } catch (error) {
      const isLastAttempt = attemptIndex >= RETRY_DELAYS_MS.length - 1;
      try {
        getDb().prepare("UPDATE webhook_deliveries SET status=?, attempts=attempts+1, response_status=?, last_error=?, completed_at=? WHERE id=?")
          .run(isLastAttempt ? "FAILED" : "PENDING", error.responseStatus ?? null, String(error.message || error).slice(0, 500), isLastAttempt ? now() : null, deliveryId);
      } catch { /* registro do histórico não pode derrubar o fluxo */ }
      if (isLastAttempt) {
        console.error(`[webhook] Falha definitiva ao enviar "${eventType}" para ${hook.name} (${hook.url}) após ${RETRY_DELAYS_MS.length} tentativas:`, error.message);
      } else {
        attemptDelivery(deliveryId, hook, eventType, payload, attemptIndex + 1);
      }
    }
  }, RETRY_DELAYS_MS[attemptIndex]);
  // Não impede o processo de encerrar num shutdown — retry pendente fica no histórico.
  timer.unref?.();
}

export function dispatchWebhooks(db, organizationId, eventType, payload) {
  const hooks = db.prepare("SELECT id, name, url, events_json, secret FROM webhooks WHERE organization_id=? AND active=1").all(organizationId);
  hooks
    .filter((hook) => parseEvents(hook.events_json).includes(eventType))
    .forEach((hook) => {
      const deliveryId = makeId("whd");
      db.prepare("INSERT INTO webhook_deliveries (id, webhook_id, organization_id, event_type, status, attempts, created_at) VALUES (?, ?, ?, ?, 'PENDING', 0, ?)")
        .run(deliveryId, hook.id, organizationId, eventType, new Date().toISOString());
      attemptDelivery(deliveryId, hook, eventType, payload, 0);
    });
}
