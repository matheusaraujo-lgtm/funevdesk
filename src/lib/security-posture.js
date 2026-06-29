/**
 * Postura de segurança (EPP) por ativo — estratégia "traduzir o que já temos".
 *
 * A partir do inventário JÁ coletado pelo agente (antivírus, firewall, BitLocker),
 * produz uma leitura humanizada para o gestor. NÃO inventa estado: quando o dado
 * não existe no inventário, o item fica como "desconhecido" (ok: null).
 *
 * Entrada esperada (campos opcionais; aceita tanto o registro cru do banco
 * quanto o inventário já desserializado):
 *   {
 *     antivirus_json?: string | array,   // [{ name, state }] ou [{ enabled }]
 *     antivirus?: array,
 *     raw_json?: string | object,        // { security: { firewall, bitlocker } }
 *     security?: object,                 // { firewall, bitlocker } já extraído
 *   }
 */

function parseMaybeJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Avalia o antivírus. Retorna true/false/null (desconhecido).
 * Considera protegido se ao menos um AV está habilitado. Suporta o formato do
 * Windows Security Center ({ state }) e o formato legado ({ enabled }).
 */
function evaluateAntivirus(inventory) {
  const av = parseMaybeJson(inventory.antivirus_json) ?? inventory.antivirus;
  if (!av) return null;
  const list = Array.isArray(av) ? av : [av];
  if (!list.length) return false; // nenhum AV instalado é um dado conhecido: desprotegido
  return list.some((item) => {
    if (!item || typeof item !== "object") return false;
    const enabled = item.enabled ?? item.isEnabled ?? item.realTimeProtection;
    if (typeof enabled === "boolean") return enabled;
    // Windows Security Center: productState/state textual. Heurística conservadora:
    // só consideramos ativo quando o texto indica explicitamente "on"/"enabled".
    if (typeof item.state === "string") {
      return /\b(on|enabled|ativo|ligado|running)\b/i.test(item.state);
    }
    // Sem sinal de estado: tratamos como desconhecido neste item (não conta como ativo).
    return false;
  });
}

/** Avalia o firewall a partir de security.firewall: [{ name, enabled }]. */
function evaluateFirewall(security) {
  const firewall = security?.firewall;
  if (!Array.isArray(firewall) || !firewall.length) return null;
  // Se algum perfil reporta estado booleano, decidimos por ele; senão, desconhecido.
  const known = firewall.filter((item) => typeof item?.enabled === "boolean");
  if (!known.length) return null;
  return known.some((item) => item.enabled === true);
}

/**
 * Avalia BitLocker a partir de security.bitlocker: [{ drive, protectionStatus }].
 * protectionStatus do Win32: 1 = protegido (ligado). 0 = desligado. 2 = desconhecido.
 */
function evaluateBitlocker(security) {
  const bitlocker = security?.bitlocker;
  if (!Array.isArray(bitlocker) || !bitlocker.length) return null;
  const known = bitlocker.filter((item) => typeof item?.protectionStatus === "number");
  if (!known.length) return null;
  // Protegido só quando TODOS os volumes conhecidos estão criptografados (status 1).
  return known.every((item) => item.protectionStatus === 1);
}

/**
 * Calcula a postura de segurança de um ativo.
 * @param {object} inventory Registro/inventário do ativo.
 * @returns {{ protected: boolean, items: Array<{ key, ok, label, status }> }}
 *   - protected: true só quando todos os itens conhecidos estão OK e nenhum é falso.
 *   - ok: true | false | null (null = desconhecido).
 *   - status: "ok" | "risk" | "unknown" (auxiliar para a UI).
 */
export function computePosture(inventory) {
  const inv = inventory && typeof inventory === "object" ? inventory : {};
  const security =
    inv.security ?? parseMaybeJson(inv.raw_json)?.security ?? null;

  const checks = [
    { key: "antivirus", label: "Antivírus ativo", ok: evaluateAntivirus(inv) },
    { key: "firewall", label: "Firewall ligado", ok: evaluateFirewall(security) },
    {
      key: "bitlocker",
      label: "Disco criptografado (BitLocker)",
      ok: evaluateBitlocker(security),
    },
  ];

  const items = checks.map((item) => ({
    ...item,
    status: item.ok === true ? "ok" : item.ok === false ? "risk" : "unknown",
  }));

  // Protegido apenas quando nenhum item está em risco E ao menos um é conhecido.
  const hasRisk = items.some((item) => item.ok === false);
  const hasKnown = items.some((item) => item.ok === true);
  const isProtected = !hasRisk && hasKnown;

  return { protected: isProtected, items };
}
