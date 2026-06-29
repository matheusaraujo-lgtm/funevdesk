/**
 * Conectores XDR/EPP — estratégia "integrar e traduzir".
 *
 * Este módulo NÃO implementa um EDR/agente de detecção próprio. Ele define
 * uma interface comum para puxar (pull) alertas de plataformas de mercado
 * (Microsoft Defender, SentinelOne, etc.) e normalizá-los para o formato da
 * tabela `xdr_alerts`.
 *
 * Regra de ouro: sem credenciais configuradas, NÃO inventamos dados.
 * `fetchAlerts()` retorna [] quando o conector não está configurado. A chamada
 * real à API do fornecedor entra exatamente no ponto marcado com TODO em cada
 * conector — não há mock nem dado sintético.
 *
 * Interface do conector:
 *   {
 *     name: string,                 // identificador do provedor (ex.: "DEFENDER")
 *     label: string,                // rótulo humano (pt-BR)
 *     isConfigured(): boolean,      // true só quando TODAS as envs existem
 *     async fetchAlerts(): Promise<Array<NormalizedAlert>>
 *   }
 *
 * NormalizedAlert (formato alinhado à tabela xdr_alerts):
 *   { provider, externalId, severity, title, description, hostname, detectedAt, raw }
 */

/** Severidades canônicas aceitas pela tabela. */
export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** Rótulos pt-BR para exibição humanizada. */
export const SEVERITY_LABELS = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

/**
 * Mapeia severidades de diferentes fornecedores para o conjunto canônico.
 * Aceita números (0-10), strings do fornecedor e variações de caixa.
 * Qualquer valor desconhecido cai em "MEDIUM" (conservador, sem inventar gravidade).
 */
function canonicalSeverity(value) {
  if (value === null || value === undefined) return "MEDIUM";
  if (typeof value === "number") {
    if (value >= 8) return "CRITICAL";
    if (value >= 5) return "HIGH";
    if (value >= 2) return "MEDIUM";
    return "LOW";
  }
  const normalized = String(value).trim().toUpperCase();
  if (SEVERITIES.includes(normalized)) return normalized;
  const aliases = {
    INFORMATIONAL: "LOW",
    INFO: "LOW",
    LOW: "LOW",
    MODERATE: "MEDIUM",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    SEVERE: "HIGH",
    CRITICAL: "CRITICAL",
  };
  return aliases[normalized] || "MEDIUM";
}

/**
 * Normaliza um alerta bruto de um fornecedor para o formato da tabela xdr_alerts.
 * Mapeia os campos comuns dos schemas do Defender (Microsoft Graph Security) e
 * do SentinelOne. Campos ausentes ficam null — sem inventar conteúdo.
 *
 * @param {object} raw   Objeto bruto retornado pela API do fornecedor.
 * @param {string} provider  Identificador do provedor (ex.: "DEFENDER").
 * @returns {object} Alerta normalizado.
 */
export function normalizeAlert(raw, provider) {
  const source = raw && typeof raw === "object" ? raw : {};
  // IDs externos variam por fornecedor: Defender usa `id`; SentinelOne, `id`/`threatId`.
  const externalId =
    source.externalId ?? source.id ?? source.threatId ?? source.alertId ?? null;
  // Severidade pode vir como string (Defender) ou numérica (escores diversos).
  const severity = canonicalSeverity(
    source.severity ?? source.threatLevel ?? source.confidenceLevel,
  );
  const title =
    source.title ??
    source.threatName ??
    source.classification ??
    source.category ??
    "Alerta de segurança";
  const description =
    source.description ?? source.summary ?? source.detectionSource ?? null;
  // Hostname costuma estar aninhado em dispositivo/endpoint conforme o fornecedor.
  const hostname =
    source.hostname ??
    source.computerName ??
    source.deviceName ??
    source.device?.hostName ??
    source.agentRealtimeInfo?.agentComputerName ??
    null;
  const detectedAt =
    source.detectedAt ??
    source.createdDateTime ??
    source.createdAt ??
    source.eventTime ??
    null;

  return {
    provider: String(provider).toUpperCase(),
    externalId: externalId != null ? String(externalId) : null,
    severity,
    title: String(title),
    description: description != null ? String(description) : null,
    hostname: hostname != null ? String(hostname) : null,
    detectedAt: detectedAt != null ? String(detectedAt) : null,
    raw: source,
  };
}

/**
 * Microsoft Defender for Endpoint (pull via Microsoft Graph Security / OAuth2).
 * Credenciais por aplicativo (client credentials flow).
 *   - DEFENDER_TENANT_ID
 *   - DEFENDER_CLIENT_ID
 *   - DEFENDER_CLIENT_SECRET
 */
export const defenderConnector = {
  name: "DEFENDER",
  label: "Microsoft Defender",
  isConfigured() {
    return Boolean(
      process.env.DEFENDER_TENANT_ID &&
        process.env.DEFENDER_CLIENT_ID &&
        process.env.DEFENDER_CLIENT_SECRET,
    );
  },
  async fetchAlerts() {
    if (!this.isConfigured()) return [];
    // TODO(integração real): quando houver credenciais, implementar aqui:
    //   1. Obter token OAuth2 (client credentials) em
    //      https://login.microsoftonline.com/{DEFENDER_TENANT_ID}/oauth2/v2.0/token
    //      com scope https://graph.microsoft.com/.default
    //   2. GET https://graph.microsoft.com/v1.0/security/alerts_v2 (ou API
    //      WindowsDefenderATP) usando o token Bearer.
    //   3. Mapear cada item com normalizeAlert(item, "DEFENDER").
    // Enquanto a chamada real não existir, retornamos vazio — sem dados falsos.
    return [];
  },
};

/**
 * SentinelOne (pull via REST API com token de serviço).
 *   - SENTINELONE_API_URL   (ex.: https://sua-instancia.sentinelone.net)
 *   - SENTINELONE_TOKEN
 */
export const sentinelOneConnector = {
  name: "SENTINELONE",
  label: "SentinelOne",
  isConfigured() {
    return Boolean(process.env.SENTINELONE_API_URL && process.env.SENTINELONE_TOKEN);
  },
  async fetchAlerts() {
    if (!this.isConfigured()) return [];
    // TODO(integração real): quando houver credenciais, implementar aqui:
    //   GET {SENTINELONE_API_URL}/web/api/v2.1/threats
    //   Header: Authorization: ApiToken {SENTINELONE_TOKEN}
    //   Mapear cada item de data[] com normalizeAlert(item, "SENTINELONE").
    // Enquanto a chamada real não existir, retornamos vazio — sem dados falsos.
    return [];
  },
};

/** Lista de conectores disponíveis. */
export function listConnectors() {
  return [defenderConnector, sentinelOneConnector];
}
