/**
 * Motor de Tradução de Sinais Técnicos → Linguagem Humana
 * -------------------------------------------------------
 * Fonte única para converter telemetria/inventário técnico em mensagens que
 * gestores e usuários leigos entendem. Camada 1 (regras determinísticas).
 * A camada 2 (IA/Claude) pode plugar depois para a cauda longa e resumos.
 *
 * Funções puras (sem React/DOM) — usadas no servidor e no cliente.
 */

// Severidades em ordem crescente de gravidade.
export const SEVERITY = { OK: "ok", INFO: "info", WARNING: "warning", CRITICAL: "critical" };
const SEVERITY_RANK = { ok: 0, info: 1, warning: 2, critical: 3 };

export function worstSeverity(list) {
  return list.reduce((acc, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[acc] ? s : acc), SEVERITY.OK);
}

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function hoursSince(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 3_600_000;
}

function antivirusOff(inventory) {
  if (!inventory) return false;
  let av = inventory.antivirus;
  if (typeof inventory.antivirus_json === "string") {
    try { av = JSON.parse(inventory.antivirus_json); } catch { av = null; }
  }
  if (!av) return false;
  const list = Array.isArray(av) ? av : [av];
  if (!list.length) return true;
  // Considera desprotegido se nenhum AV está habilitado/atualizado.
  return list.every((item) => {
    const enabled = item?.enabled ?? item?.isEnabled ?? item?.realTimeProtection;
    return enabled === false;
  });
}

/**
 * Catálogo de regras. Cada regra traduz uma condição técnica em:
 *  - manager: frase para o gestor (nomeia a máquina/pessoa)
 *  - user: frase para o usuário final (1ª pessoa, sem jargão)
 *  - action: próximo passo sugerido
 *  - icon: nome do ícone lucide (mapeado na UI)
 */
const RULES = [
  {
    id: "OFFLINE",
    severity: SEVERITY.CRITICAL,
    test: ({ asset }) => asset.status === "OFFLINE" || hoursSince(asset.last_seen_at) > 24,
    manager: ({ asset }) => `O computador ${asset.hostname} está desconectado e não responde.`,
    user: () => "Seu computador está sem comunicação com o suporte.",
    detail: ({ asset }) => asset.last_seen_at ? `Visto pela última vez há ${Math.round(hoursSince(asset.last_seen_at))}h.` : "Sem comunicação recente.",
    action: "Verifique se o computador está ligado e conectado à internet.",
    icon: "PlugZap",
  },
  {
    id: "DISK_FULL",
    severity: SEVERITY.CRITICAL,
    test: ({ asset }) => pct(asset.disk_percent) !== null && pct(asset.disk_percent) >= 95,
    manager: ({ asset }) => `O computador ${asset.hostname} vai parar de funcionar em breve por falta de espaço.`,
    user: () => "Seu computador está quase sem espaço — isso pode travar o sistema.",
    detail: ({ asset }) => `Apenas ${100 - pct(asset.disk_percent)}% de espaço livre.`,
    action: "Solicite uma limpeza de disco ao suporte.",
    icon: "HardDrive",
  },
  {
    id: "DISK_LOW",
    severity: SEVERITY.WARNING,
    test: ({ asset }) => pct(asset.disk_percent) !== null && pct(asset.disk_percent) >= 85 && pct(asset.disk_percent) < 95,
    manager: ({ asset }) => `O computador ${asset.hostname} está ficando sem espaço em disco.`,
    user: () => "Seu computador está com pouco espaço livre.",
    detail: ({ asset }) => `${100 - pct(asset.disk_percent)}% de espaço livre.`,
    action: "Vale agendar uma limpeza preventiva.",
    icon: "HardDrive",
  },
  {
    id: "CPU_HIGH",
    severity: SEVERITY.WARNING,
    test: ({ asset }) => pct(asset.cpu_percent) !== null && pct(asset.cpu_percent) >= 90,
    manager: ({ asset }) => `O computador ${asset.hostname} está sobrecarregado e pode ficar lento ou travar.`,
    user: () => "Seu computador está trabalhando no limite e pode ficar lento.",
    detail: ({ asset }) => `Processador em ${pct(asset.cpu_percent)}% de uso.`,
    action: "Feche programas pesados; se persistir, acione o suporte.",
    icon: "Cpu",
  },
  {
    id: "MEMORY_HIGH",
    severity: SEVERITY.WARNING,
    test: ({ asset }) => pct(asset.memory_percent) !== null && pct(asset.memory_percent) >= 90,
    manager: ({ asset }) => `O computador ${asset.hostname} está com a memória esgotada.`,
    user: () => "Seu computador está com a memória cheia e pode travar.",
    detail: ({ asset }) => `Memória em ${pct(asset.memory_percent)}% de uso.`,
    action: "Reinicie o computador para liberar memória.",
    icon: "Activity",
  },
  {
    id: "ANTIVIRUS_OFF",
    severity: SEVERITY.CRITICAL,
    test: ({ inventory }) => antivirusOff(inventory),
    manager: ({ asset }) => `O computador ${asset.hostname} está sem proteção contra vírus ativa.`,
    user: () => "A proteção contra vírus do seu computador está desativada.",
    detail: () => "Nenhum antivírus habilitado foi detectado.",
    action: "Acione o suporte para reativar a proteção.",
    icon: "ShieldAlert",
  },
];

/**
 * Traduz um ativo (opcionalmente com inventário) em uma lista de sinais humanos.
 * @param {object} asset linha de `assets`
 * @param {object} [inventory] linha de `asset_inventory` (ou objeto parseado)
 * @returns {{ severity: string, signals: Array }}
 */
export function translateAsset(asset, inventory) {
  if (!asset) return { severity: SEVERITY.OK, signals: [] };
  const ctx = { asset, inventory };
  const signals = RULES.filter((rule) => {
    try { return rule.test(ctx); } catch { return false; }
  }).map((rule) => ({
    id: rule.id,
    severity: rule.severity,
    icon: rule.icon,
    manager: rule.manager(ctx),
    user: rule.user(ctx),
    detail: rule.detail(ctx),
    action: rule.action,
  }));
  return { severity: worstSeverity(signals.map((s) => s.severity)), signals };
}

/** Rótulo amigável de saúde geral. */
export function healthLabel(severity) {
  return {
    ok: { text: "Tudo certo", tone: "ok" },
    info: { text: "Atenção leve", tone: "info" },
    warning: { text: "Precisa de atenção", tone: "warning" },
    critical: { text: "Ação necessária", tone: "critical" },
  }[severity] || { text: "Tudo certo", tone: "ok" };
}

/** Frase positiva quando não há sinais. */
export function allClearMessage(role = "user") {
  return role === "manager"
    ? "Todos os equipamentos estão operando normalmente."
    : "Seu computador está funcionando normalmente. 👍";
}

/**
 * Traduz um dispositivo de rede (link/filial) para o gestor.
 * @param {object} device linha de `network_devices`
 */
export function translateNetworkDevice(device) {
  if (!device) return null;
  if (device.status === "OFFLINE") {
    return {
      id: "LINK_DOWN",
      severity: SEVERITY.CRITICAL,
      icon: "WifiOff",
      manager: `${device.name} (${device.branch_name || "rede"}) está fora do ar.`,
      detail: device.last_error || "Sem resposta.",
      action: "Verifique o equipamento/operadora do local.",
    };
  }
  if (device.status === "ALERTA") {
    return {
      id: "LINK_DEGRADED",
      severity: SEVERITY.WARNING,
      icon: "Wifi",
      manager: `${device.name} (${device.branch_name || "rede"}) está instável.`,
      detail: device.last_error || "Desempenho abaixo do esperado.",
      action: "Monitorar; pode indicar problema de link.",
    };
  }
  return null;
}

/**
 * Resumo executivo da frota para o gestor: conta máquinas por severidade
 * e devolve uma frase única + os principais sinais.
 */
export function summarizeFleet(assets = [], devices = []) {
  const perAsset = assets.map((a) => translateAsset(a, a.inventory));
  const critical = perAsset.filter((r) => r.severity === SEVERITY.CRITICAL).length;
  const warning = perAsset.filter((r) => r.severity === SEVERITY.WARNING).length;
  const linkSignals = devices.map(translateNetworkDevice).filter(Boolean);
  const linksDown = linkSignals.filter((s) => s.severity === SEVERITY.CRITICAL).length;

  let headline;
  if (!critical && !warning && !linksDown) headline = "Está tudo sob controle na sua operação.";
  else {
    const parts = [];
    if (critical) parts.push(`${critical} computador(es) precisam de ação imediata`);
    if (linksDown) parts.push(`${linksDown} link(s) fora do ar`);
    if (warning) parts.push(`${warning} com atenção`);
    headline = `Resumo: ${parts.join(", ")}.`;
  }
  return {
    headline,
    counts: { critical, warning, linksDown },
    topSignals: [
      ...perAsset.flatMap((r) => r.signals).filter((s) => s.severity === SEVERITY.CRITICAL),
      ...linkSignals.filter((s) => s.severity === SEVERITY.CRITICAL),
    ].slice(0, 6),
  };
}
