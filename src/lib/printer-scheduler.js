import { getDb } from "@/lib/db";
import { checkNetworkDevice } from "@/lib/network-monitor";
import { maybeOpenPrinterTicket } from "@/lib/printer-alerts";

// Verificação automática (ping/portas/SNMP) de todos os dispositivos de rede e
// impressoras, em segundo plano, sem precisar clicar "Verificar agora".
const INTERVAL_MS = 15 * 60 * 1000; // 15 minutos (intervalo fixo)

async function runScheduledNetworkChecks() {
  let db;
  try { db = getDb(); } catch { return; }
  let devices;
  try { devices = db.prepare("SELECT * FROM network_devices").all(); } catch { return; }
  if (!devices.length) return;
  const now = new Date().toISOString();
  const update = db.prepare(
    "UPDATE network_devices SET status=?, latency_ms=?, last_seen_at=?, metrics_json=?, last_error=? WHERE id=?",
  );
  for (const device of devices) {
    try {
      const result = await checkNetworkDevice(device);
      const lastSeenAt = result.reachable ? now : device.last_seen_at;
      update.run(result.status, result.latencyMs, lastSeenAt, JSON.stringify(result.metrics), result.lastError || null, device.id);
      if (device.monitor_type === "PRINTER" && device.auto_ticket) {
        try { maybeOpenPrinterTicket(db, device, result); } catch { /* auto-chamado não bloqueia a verificação */ }
      }
    } catch { /* falha em um dispositivo não interrompe os demais */ }
  }
}

export function startPrinterScheduler() {
  // Guard em globalThis para sobreviver a recompilações de HMR (não duplicar o timer).
  if (globalThis.__nexusPrinterScheduler) return;
  globalThis.__nexusPrinterScheduler = true;
  // Primeira verificação ~30s após subir (deixa o servidor estabilizar), depois a cada 15 min.
  setTimeout(() => {
    runScheduledNetworkChecks();
    setInterval(runScheduledNetworkChecks, INTERVAL_MS);
  }, 30_000);
}
