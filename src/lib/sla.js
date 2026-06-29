export const prioritySlaMultiplier = {
  CRITICA: 0.25,
  ALTA: 0.5,
  MEDIA: 1,
  BAIXA: 2,
};

export function computeSlaDueAt(slaHours, priority) {
  const multiplier = prioritySlaMultiplier[priority] ?? 1;
  const ms = slaHours * multiplier * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

// Política de SLA por prioridade: meta de 1ª resposta (min) e de resolução (h).
// Defaults reproduzem o comportamento legado (8h × multiplicador) para resolução.
export const defaultSlaPolicy = {
  CRITICA: { firstResponseMinutes: 15, resolutionHours: 2 },
  ALTA: { firstResponseMinutes: 30, resolutionHours: 4 },
  MEDIA: { firstResponseMinutes: 60, resolutionHours: 8 },
  BAIXA: { firstResponseMinutes: 240, resolutionHours: 16 },
};

// Normaliza um JSON salvo (ou objeto) mesclando com os defaults — tolera campos faltando.
export function parseSlaPolicy(input) {
  let raw = input;
  if (typeof input === "string") {
    try { raw = JSON.parse(input); } catch { raw = null; }
  }
  const policy = {};
  for (const priority of Object.keys(defaultSlaPolicy)) {
    const base = defaultSlaPolicy[priority];
    const given = raw?.[priority] || {};
    policy[priority] = {
      firstResponseMinutes: clampInt(given.firstResponseMinutes, base.firstResponseMinutes, 1, 100000),
      resolutionHours: clampInt(given.resolutionHours, base.resolutionHours, 1, 8760),
    };
  }
  return policy;
}

function clampInt(value, fallback, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function computeResolutionDueAt(policy, priority, fromMs = Date.now()) {
  const hours = policy?.[priority]?.resolutionHours ?? defaultSlaPolicy[priority]?.resolutionHours ?? 8;
  return new Date(fromMs + hours * 60 * 60 * 1000).toISOString();
}

export function computeFirstResponseDueAt(policy, priority, fromMs = Date.now()) {
  const minutes = policy?.[priority]?.firstResponseMinutes ?? defaultSlaPolicy[priority]?.firstResponseMinutes ?? 60;
  return new Date(fromMs + minutes * 60 * 1000).toISOString();
}

// Status da meta de 1ª resposta. Se já houve resposta, compara com o prazo; senão, olha o tempo restante.
export function getFirstResponseStatus(dueAt, firstResponseAt) {
  if (!dueAt) return "SEM_SLA";
  if (firstResponseAt) {
    return new Date(firstResponseAt).getTime() <= new Date(dueAt).getTime() ? "CUMPRIDO" : "VIOLADO";
  }
  const remaining = new Date(dueAt).getTime() - Date.now();
  if (remaining <= 0) return "VIOLADO";
  if (remaining <= 15 * 60 * 1000) return "EM_RISCO";
  return "DENTRO_PRAZO";
}

export function getSlaStatus(slaDueAt, status, options = {}) {
  const { pausesSla = false, isTerminal = false } = options;
  if (isTerminal || status === "RESOLVIDO") return "OK";
  if (pausesSla || status === "PENDENTE") return "PAUSADO";
  if (!slaDueAt) return "SEM_SLA";
  const remaining = new Date(slaDueAt).getTime() - Date.now();
  if (remaining <= 0) return "VIOLADO";
  if (remaining <= 60 * 60 * 1000) return "EM_RISCO";
  return "DENTRO_PRAZO";
}

/** Ajusta SLA ao sair de status que pausa o relógio. */
export function extendSlaAfterPause(slaDueAt, slaPausedAt) {
  if (!slaDueAt || !slaPausedAt) return slaDueAt;
  const pausedMs = Date.now() - new Date(slaPausedAt).getTime();
  if (pausedMs <= 0) return slaDueAt;
  return new Date(new Date(slaDueAt).getTime() + pausedMs).toISOString();
}
