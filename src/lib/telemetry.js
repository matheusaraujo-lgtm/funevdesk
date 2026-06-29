// Telemetria como série temporal: cada heartbeat vira um ponto histórico em asset_metrics,
// em vez de só sobrescrever o estado atual do ativo.

const DAY_MS = 24 * 60 * 60 * 1000;

// Probabilidade de rodar a limpeza (retenção) dentro de um recordAssetMetric.
// Mantém a tabela enxuta sem custo a cada heartbeat.
const PRUNE_CHANCE = 0.02;

export function recordAssetMetric(db, assetId, { cpuPercent, memoryPercent, diskPercent, status } = {}) {
  if (!assetId) return;
  const collectedAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO asset_metrics (asset_id, cpu_percent, memory_percent, disk_percent, status, collected_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    assetId,
    cpuPercent ?? null,
    memoryPercent ?? null,
    diskPercent ?? null,
    status ?? null,
    collectedAt
  );

  // Limpeza ocasional/barata para a tabela não crescer infinitamente.
  if (Math.random() < PRUNE_CHANCE) {
    try {
      pruneAssetMetrics(db, {});
    } catch {
      // retenção é best-effort; nunca deve derrubar o heartbeat.
    }
  }
}

export function getAssetMetrics(db, assetId, { since } = {}) {
  if (!assetId) return [];
  const sinceIso = since || new Date(Date.now() - DAY_MS).toISOString();
  return db.prepare(
    `SELECT cpu_percent, memory_percent, disk_percent, status, collected_at
     FROM asset_metrics
     WHERE asset_id=? AND collected_at >= ?
     ORDER BY collected_at ASC`
  ).all(assetId, sinceIso);
}

export function pruneAssetMetrics(db, { days = 30 } = {}) {
  const cutoff = new Date(Date.now() - days * DAY_MS).toISOString();
  return db.prepare("DELETE FROM asset_metrics WHERE collected_at < ?").run(cutoff);
}
