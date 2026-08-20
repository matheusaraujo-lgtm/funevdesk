import { getDb } from "@/lib/db";
import { reopenDuePendingTickets } from "@/lib/pending-tickets";

// Verifica chamados pendentes com data de reabertura vencida e reabre sozinho.
// Ajustável por env (PENDING_TICKETS_INTERVAL_MS); padrão 5 minutos.
const INTERVAL_MS = Math.max(60_000, Number(process.env.PENDING_TICKETS_INTERVAL_MS) || 5 * 60 * 1000);

function runCheck() {
  if (globalThis.__nexusPendingTicketsRunning) return;
  globalThis.__nexusPendingTicketsRunning = true;
  try {
    const db = getDb();
    reopenDuePendingTickets(db);
  } catch {
    // Falha pontual não deve derrubar o agendador — tenta de novo no próximo tick.
  } finally {
    globalThis.__nexusPendingTicketsRunning = false;
  }
}

export function startPendingTicketScheduler() {
  // Guard em globalThis para sobreviver a recompilações de HMR (não duplicar o timer).
  if (globalThis.__nexusPendingTicketScheduler) return;
  globalThis.__nexusPendingTicketScheduler = true;
  setTimeout(() => {
    runCheck();
    setInterval(runCheck, INTERVAL_MS);
  }, 30_000);
}
