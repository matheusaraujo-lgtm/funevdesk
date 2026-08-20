import { getDb } from "@/lib/db";
import { runRecurringTicketsCheck } from "@/lib/recurring-tickets";

// Verifica modelos de chamado recorrente vencidos e abre os chamados sozinho.
// Ajustável por env (RECURRING_TICKETS_INTERVAL_MS); padrão 10 minutos — não precisa ser
// mais frequente que isso, já que a menor granularidade de recorrência é "a cada 1 dia".
const INTERVAL_MS = Math.max(60_000, Number(process.env.RECURRING_TICKETS_INTERVAL_MS) || 10 * 60 * 1000);

function runCheck() {
  if (globalThis.__nexusRecurringTicketsRunning) return;
  globalThis.__nexusRecurringTicketsRunning = true;
  try {
    const db = getDb();
    runRecurringTicketsCheck(db);
  } catch {
    // Falha pontual não deve derrubar o agendador — tenta de novo no próximo tick.
  } finally {
    globalThis.__nexusRecurringTicketsRunning = false;
  }
}

export function startRecurringTicketScheduler() {
  // Guard em globalThis para sobreviver a recompilações de HMR (não duplicar o timer).
  if (globalThis.__nexusRecurringTicketScheduler) return;
  globalThis.__nexusRecurringTicketScheduler = true;
  setTimeout(() => {
    runCheck();
    setInterval(runCheck, INTERVAL_MS);
  }, 30_000);
}
