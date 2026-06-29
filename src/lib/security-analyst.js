import { makeId } from "@/lib/db";
import { explainSecurity, insightToTicketDescription } from "@/lib/intelligence";

/**
 * Analista de segurança do FunevDesk.
 *
 * Atua sobre os alertas de XDR/EPP ingeridos na tabela `xdr_alerts` (provedores
 * de mercado — Defender, SentinelOne, etc.). Traduz a ameaça em linguagem
 * simples, faz a triagem (severidade → prioridade) e abre chamado proativo,
 * vinculando o alerta ao chamado (dedup via xdr_alerts.ticket_id).
 */

// Severidade do alerta (canônica do conector) → prioridade do chamado.
export const XDR_SEVERITY_PRIORITY = {
  CRITICAL: "CRITICA",
  HIGH: "ALTA",
  MEDIUM: "MEDIA",
  LOW: "BAIXA",
};

// Severidade do Defender (rótulo PT do agente) → severidade canônica do XDR.
const DEFENDER_SEVERITY = {
  grave: "CRITICAL",
  alta: "HIGH",
  moderada: "MEDIUM",
  baixa: "LOW",
};

// Estados de triagem aceitos para um alerta de segurança.
export const XDR_STATUSES = ["NEW", "INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"];

export const XDR_STATUS_LABELS = {
  NEW: "Novo",
  INVESTIGATING: "Em análise",
  RESOLVED: "Resolvido",
  FALSE_POSITIVE: "Falso positivo",
};

/**
 * Ingere as ameaças detectadas pelo Microsoft Defender (vindas do inventário do
 * agente) como alertas na Central de Segurança. Provider WINDOWS_DEFENDER; dedup
 * por (provider, external_id) via UNIQUE da tabela. Torna o EPP funcional de
 * ponta a ponta: detecção real → alerta → analista → chamado.
 *
 * @returns {number} quantidade de ameaças ingeridas/atualizadas.
 */
export function ingestDefenderThreats(db, asset, epp) {
  if (!asset?.id || !epp || !Array.isArray(epp.threats) || !epp.threats.length) return 0;
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO xdr_alerts
      (id, organization_id, asset_id, provider, external_id, severity, title, description, status, raw_json, detected_at, created_at)
    VALUES (?, ?, ?, 'WINDOWS_DEFENDER', ?, ?, ?, ?, 'NEW', ?, ?, ?)
    ON CONFLICT(organization_id, provider, external_id) DO UPDATE SET
      severity=excluded.severity, title=excluded.title, description=excluded.description,
      raw_json=excluded.raw_json, detected_at=excluded.detected_at, asset_id=excluded.asset_id
  `);
  let count = 0;
  for (const threat of epp.threats.slice(0, 50)) {
    const externalId = String(threat.id || threat.threatId || threat.name || "").slice(0, 120);
    if (!externalId) continue;
    const severity = DEFENDER_SEVERITY[String(threat.severity || "").toLowerCase()] || "MEDIUM";
    const description = [
      threat.action ? `Ação tomada: ${threat.action}` : "",
      threat.resources ? `Arquivo/recurso: ${threat.resources}` : "",
      threat.processName ? `Processo: ${threat.processName}` : "",
    ].filter(Boolean).join(" · ");
    upsert.run(
      makeId("xdr"), asset.organization_id, asset.id, externalId, severity,
      threat.name || "Ameaça detectada pelo Defender", description || null,
      JSON.stringify(threat), threat.detectedAt || null, now,
    );
    count += 1;
  }
  return count;
}

// Postura de proteção do endpoint: além das ameaças, um dispositivo SEM antivírus,
// com proteção em tempo real ou tamper desligados, ou com assinaturas velhas é um
// risco que precisa ser visível na Central de Segurança (paridade com EDR de mercado).
const POSTURE_RULES = [
  { key: "POSTURE-NO-AV", severity: "CRITICAL", title: "Endpoint sem antivírus ativo", desc: "Nenhuma proteção antivírus está ativa neste dispositivo.", test: (e) => e.antivirusEnabled === false },
  { key: "POSTURE-RT-OFF", severity: "HIGH", title: "Proteção em tempo real desativada", desc: "A proteção em tempo real do antivírus está desligada.", test: (e) => e.realtimeProtection === false },
  { key: "POSTURE-TAMPER-OFF", severity: "HIGH", title: "Proteção contra adulteração desativada", desc: "A proteção contra adulteração (tamper protection) está desligada — risco de o antivírus ser desativado por malware.", test: (e) => e.tamperProtection === false },
  { key: "POSTURE-SIG-OLD", severity: "MEDIUM", title: "Assinaturas de antivírus desatualizadas", desc: "As assinaturas do antivírus estão com mais de 7 dias — proteção pode não reconhecer ameaças recentes.", test: (e) => typeof e.signatureAgeDays === "number" && e.signatureAgeDays > 7 },
];

export function ingestPostureAlerts(db, asset, epp) {
  if (!asset?.id || !epp) return 0;
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO xdr_alerts
      (id, organization_id, asset_id, provider, external_id, severity, title, description, status, raw_json, detected_at, created_at)
    VALUES (?, ?, ?, 'AGENT_POSTURE', ?, ?, ?, ?, 'NEW', ?, ?, ?)
    ON CONFLICT(organization_id, provider, external_id) DO UPDATE SET
      severity=excluded.severity, title=excluded.title, description=excluded.description,
      raw_json=excluded.raw_json, asset_id=excluded.asset_id
  `);
  const resolve = db.prepare("UPDATE xdr_alerts SET status='RESOLVED' WHERE organization_id=? AND asset_id=? AND provider='AGENT_POSTURE' AND external_id=? AND status NOT IN ('RESOLVED','FALSE_POSITIVE')");
  let count = 0;
  for (const rule of POSTURE_RULES) {
    if (rule.test(epp)) {
      upsert.run(makeId("xdr"), asset.organization_id, asset.id, rule.key, rule.severity, rule.title, rule.desc, JSON.stringify({ posture: rule.key, epp }), now, now);
      count += 1;
    } else {
      // Postura normalizada: fecha o alerta aberto desta regra (auto-remediação).
      resolve.run(asset.organization_id, asset.id, rule.key);
    }
  }
  return count;
}

/**
 * Carrega um alerta XDR garantindo escopo de organização e de unidade.
 * Retorna a linha (com asset_id/branch resolvidos) ou null se inacessível.
 */
export function getScopedXdrAlert(db, id, currentUser, permissions) {
  const alert = db.prepare(`
    SELECT x.*, a.branch_id AS asset_branch_id, a.hostname AS asset_hostname,
      a.os_name AS asset_os, a.logged_user AS asset_user, a.ip_address AS asset_ip
    FROM xdr_alerts x LEFT JOIN assets a ON a.id=x.asset_id
    WHERE x.id=?
  `).get(id);
  if (!alert || alert.organization_id !== currentUser.organization_id) return null;
  // Sem ativo → alerta de organização (visível ao escopo). Com ativo → exige unidade permitida.
  if (!permissions.canViewAllBranches && alert.asset_branch_id) {
    if (!currentUser.branchIds?.includes(alert.asset_branch_id)) return null;
  }
  return alert;
}

/**
 * Abre um chamado proativo a partir de um alerta XDR. Idempotente: se o alerta
 * já tem chamado vinculado (não-encerrado), retorna o existente sem duplicar.
 *
 * @param {object} db
 * @param {object} alert   Linha de xdr_alerts (com asset_id, severity, title, description, hostname?).
 * @param {object} [insight]  Insight já calculado (ex.: refinado por DeepSeek). Se ausente, usa regras.
 * @returns {{ id, number, title, reused?: boolean } | null}
 */
export function openTicketFromXdrAlert(db, alert, insight) {
  if (!alert) return null;

  // Dedup: alerta já tem chamado vivo? Reaproveita.
  if (alert.ticket_id) {
    const existing = db.prepare("SELECT id, number, title, status FROM tickets WHERE id=?").get(alert.ticket_id);
    if (existing && existing.status !== "RESOLVIDO") {
      return { id: existing.id, number: existing.number, title: existing.title, reused: true };
    }
  }

  // Resolve unidade: pelo ativo vinculado; senão, primeira unidade da organização.
  const asset = alert.asset_id
    ? db.prepare("SELECT id, branch_id, hostname, os_name, logged_user, ip_address FROM assets WHERE id=?").get(alert.asset_id)
    : null;
  const branchId = asset?.branch_id
    || db.prepare("SELECT id FROM branches WHERE organization_id=? ORDER BY created_at LIMIT 1").get(alert.organization_id)?.id;
  if (!branchId) return null;

  const assetCtx = {
    hostname: asset?.hostname || alert.hostname || null,
    logged_user: asset?.logged_user || null,
    ip_address: asset?.ip_address || null,
  };
  const detail = [alert.title, alert.description].filter(Boolean).join(" — ");
  const resolved = insight || explainSecurity(alert.provider || "XDR", assetCtx, detail);
  const priority = XDR_SEVERITY_PRIORITY[alert.severity] || resolved.priority || "ALTA";

  const number = db.prepare("SELECT COALESCE(MAX(number), 1000)+1 AS next FROM tickets").get().next;
  const id = makeId("tkt");
  const now = new Date().toISOString();
  const description = insightToTicketDescription(resolved, {
    hostname: assetCtx.hostname,
    logged_user: assetCtx.logged_user,
    ip_address: assetCtx.ip_address,
    metric: `${alert.provider || "XDR"} · ${alert.severity} · ${alert.title}`,
  });

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO tickets
      (id, number, organization_id, branch_id, asset_id, title, description, category, kind, priority, status, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Segurança', 'INCIDENTE', ?, 'ABERTO', 'MONITOR', ?, ?)`)
      .run(id, number, alert.organization_id, branchId, asset?.id || null, resolved.titulo, description, priority, now, now);
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, NULL, ?, 'CREATED', ?, ?)")
      .run(makeId("evt"), id, "Analista de Segurança", "Chamado aberto automaticamente a partir de alerta XDR/EPP.", now);
    // Vincula o alerta ao chamado e move a triagem para "Em análise".
    db.prepare("UPDATE xdr_alerts SET ticket_id=?, status='INVESTIGATING' WHERE id=?").run(id, alert.id);
  });
  tx();

  return { id, number, title: resolved.titulo };
}
