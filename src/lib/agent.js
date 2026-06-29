import crypto from "node:crypto";
import { makeId } from "@/lib/db";
import { hashToken } from "@/lib/security";
import { explainTelemetry, insightToTicketDescription } from "@/lib/intelligence";

export function generateAgentToken() {
  return `nxd_${crypto.randomBytes(24).toString("base64url")}`;
}

export function generateEnrollmentKey() {
  return `nxen_${crypto.randomBytes(18).toString("base64url")}`;
}

/**
 * Mascara um segredo para exibição (prefixo). Mesmo formato da migração de
 * boot (lib-db/index.cjs · maskSecretPrefix) para manter consistência: os
 * primeiros 8 caracteres + '…' + os últimos 4.
 */
export function maskSecretPrefix(value) {
  const v = String(value || "");
  if (!v) return "";
  if (v.length <= 12) return `${v.slice(0, 4)}…`;
  return `${v.slice(0, 8)}…${v.slice(-4)}`;
}

/**
 * Gera um novo token de ativo e devolve os artefatos para persistência por hash.
 * O texto puro (`plaintext`) deve ser exibido/entregue UMA única vez a quem chamou;
 * apenas `hash` + `prefix` são gravados em repouso.
 */
export function issueAgentToken() {
  const plaintext = generateAgentToken();
  return { plaintext, hash: hashToken(plaintext), prefix: maskSecretPrefix(plaintext) };
}

/**
 * Garante que a organização tenha uma chave de enrollment hasheada em repouso.
 * Nunca persiste/retorna o texto puro armazenado: se já existir hash, devolve
 * apenas o prefixo mascarado (plaintextOnce = null). Se não existir, gera uma
 * nova chave, grava hash + prefixo e devolve o texto puro UMA vez.
 * @returns {{ prefix: string, plaintextOnce: string|null }}
 */
export function ensureEnrollmentKey(db, organizationId) {
  const row = db.prepare(
    "SELECT agent_enrollment_key_hash, agent_enrollment_key_prefix FROM system_settings WHERE organization_id=?",
  ).get(organizationId);
  if (row?.agent_enrollment_key_hash) {
    return { prefix: row.agent_enrollment_key_prefix || "", plaintextOnce: null };
  }
  const plaintextOnce = generateEnrollmentKey();
  const hash = hashToken(plaintextOnce);
  const prefix = maskSecretPrefix(plaintextOnce);
  const now = new Date().toISOString();
  const updated = db.prepare(
    "UPDATE system_settings SET agent_enrollment_key_hash=?, agent_enrollment_key_prefix=?, agent_enrollment_key=NULL, updated_at=? WHERE organization_id=?",
  ).run(hash, prefix, now, organizationId);
  if (!updated.changes) {
    db.prepare(`INSERT INTO system_settings (organization_id, sla_hours, remote_access_enabled, automatic_tickets_enabled, agent_enrollment_key_hash, agent_enrollment_key_prefix, updated_at)
      VALUES (?, 8, 1, 1, ?, ?, ?)`).run(organizationId, hash, prefix, now);
  }
  return { prefix, plaintextOnce };
}

/**
 * Gera e persiste uma NOVA chave de enrollment (rotação), substituindo o hash
 * anterior. Devolve o texto puro UMA vez para exibição imediata + o prefixo.
 * @returns {{ prefix: string, plaintextOnce: string }}
 */
export function rotateEnrollmentKey(db, organizationId) {
  const plaintextOnce = generateEnrollmentKey();
  const hash = hashToken(plaintextOnce);
  const prefix = maskSecretPrefix(plaintextOnce);
  const now = new Date().toISOString();
  const updated = db.prepare(
    "UPDATE system_settings SET agent_enrollment_key_hash=?, agent_enrollment_key_prefix=?, agent_enrollment_key=NULL, updated_at=? WHERE organization_id=?",
  ).run(hash, prefix, now, organizationId);
  if (!updated.changes) {
    db.prepare(`INSERT INTO system_settings (organization_id, sla_hours, remote_access_enabled, automatic_tickets_enabled, agent_enrollment_key_hash, agent_enrollment_key_prefix, updated_at)
      VALUES (?, 8, 1, 1, ?, ?, ?)`).run(organizationId, hash, prefix, now);
  }
  return { prefix, plaintextOnce };
}

export function findAssetByToken(db, token) {
  if (!token) return null;
  // Agentes já instalados enviam o token em claro; comparamos pelo hash em repouso.
  return db.prepare("SELECT * FROM assets WHERE agent_token_hash=?").get(hashToken(token)) || null;
}

export function findOrganizationByEnrollmentKey(db, token) {
  if (!token) return null;
  return db.prepare(`
    SELECT s.organization_id, o.name organization_name
    FROM system_settings s JOIN organizations o ON o.id=s.organization_id
    WHERE s.agent_enrollment_key_hash=?
  `).get(hashToken(token)) || null;
}

export function upsertAssetFromTelemetry(db, organizationId, branchId, data, token) {
  const now = new Date().toISOString();
  const hostname = data.hostname?.trim();
  if (!hostname) return null;

  // O token chega em claro; gravamos/comparamos sempre por hash em repouso.
  const tokenHash = token ? hashToken(token) : null;
  const tokenPrefix = token ? maskSecretPrefix(token) : null;

  let asset = db.prepare(`
    SELECT * FROM assets WHERE organization_id=? AND (
      agent_token_hash=? OR hostname=? OR (machine_uuid IS NOT NULL AND machine_uuid=?)
    ) ORDER BY CASE WHEN agent_token_hash=? THEN 0 WHEN hostname=? THEN 1 ELSE 2 END LIMIT 1
  `).get(organizationId, tokenHash, hostname, data.machineUuid || null, tokenHash, hostname);

  const status = data.cpuPercent >= 90 || data.memoryPercent >= 95 || data.diskPercent >= 90 ? "ALERT" : "ONLINE";

  if (asset) {
    db.prepare(`UPDATE assets SET hostname=?, os_name=?, ip_address=?, logged_user=?, status=?,
      cpu_percent=?, memory_percent=?, disk_percent=?, last_seen_at=?, agent_domain=?, serial_number=?, machine_uuid=?,
      agent_token=NULL, agent_token_hash=?, agent_token_prefix=? WHERE id=?`)
      .run(
        hostname, data.osName || asset.os_name, data.ipAddress || asset.ip_address,
        data.loggedUser || asset.logged_user, status, data.cpuPercent, data.memoryPercent, data.diskPercent,
        now, data.domain || asset.agent_domain, data.serialNumber || asset.serial_number,
        data.machineUuid || asset.machine_uuid, tokenHash, tokenPrefix, asset.id
      );
    return db.prepare("SELECT * FROM assets WHERE id=?").get(asset.id);
  }

  if (!branchId) {
    branchId = db.prepare("SELECT id FROM branches WHERE organization_id=? ORDER BY CASE type WHEN 'MATRIZ' THEN 0 ELSE 1 END LIMIT 1").get(organizationId)?.id;
  }
  if (!branchId) return null;

  const id = makeId("ast");
  db.prepare(`INSERT INTO assets
    (id, organization_id, branch_id, hostname, asset_type, os_name, ip_address, logged_user, status,
     cpu_percent, memory_percent, disk_percent, last_seen_at, agent_token, agent_token_hash, agent_token_prefix, agent_domain, serial_number, machine_uuid, created_at)
    VALUES (?, ?, ?, ?, 'DESKTOP', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`)
    .run(
      id, organizationId, branchId, hostname, data.osName || null, data.ipAddress || null,
      data.loggedUser || null, status, data.cpuPercent, data.memoryPercent, data.diskPercent,
      now, tokenHash, tokenPrefix, data.domain || null, data.serialNumber || null, data.machineUuid || null, now
    );
  return db.prepare("SELECT * FROM assets WHERE id=?").get(id);
}

function jsonOrNull(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export function saveAssetInventory(db, assetId, inventory) {
  if (!assetId || !inventory) return;
  const hardware = inventory.hardware || {};
  const storage = inventory.storage || {};
  const network = Array.isArray(inventory.networkAdapters) ? inventory.networkAdapters : [];
  const software = Array.isArray(inventory.installedSoftware) ? inventory.installedSoftware : [];
  const macAddresses = network.map((adapter) => adapter.macAddress).filter(Boolean);
  const collectedAt = inventory.collectedAt || new Date().toISOString();

  db.prepare(`
    INSERT INTO asset_inventory
      (asset_id, manufacturer, model, bios_version, processor_name, cpu_cores, cpu_logical_processors,
       memory_total_gb, disk_total_gb, disk_free_gb, mac_addresses_json, network_adapters_json,
       antivirus_json, local_admins_json, installed_software_json, raw_json, collected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET
      manufacturer=excluded.manufacturer,
      model=excluded.model,
      bios_version=excluded.bios_version,
      processor_name=excluded.processor_name,
      cpu_cores=excluded.cpu_cores,
      cpu_logical_processors=excluded.cpu_logical_processors,
      memory_total_gb=excluded.memory_total_gb,
      disk_total_gb=excluded.disk_total_gb,
      disk_free_gb=excluded.disk_free_gb,
      mac_addresses_json=excluded.mac_addresses_json,
      network_adapters_json=excluded.network_adapters_json,
      antivirus_json=excluded.antivirus_json,
      local_admins_json=excluded.local_admins_json,
      installed_software_json=excluded.installed_software_json,
      raw_json=excluded.raw_json,
      collected_at=excluded.collected_at
  `).run(
    assetId,
    hardware.manufacturer || null,
    hardware.model || null,
    hardware.biosVersion || null,
    hardware.processorName || null,
    Number.isFinite(hardware.cpuCores) ? hardware.cpuCores : null,
    Number.isFinite(hardware.cpuLogicalProcessors) ? hardware.cpuLogicalProcessors : null,
    Number.isFinite(hardware.memoryTotalGb) ? hardware.memoryTotalGb : null,
    Number.isFinite(storage.diskTotalGb) ? storage.diskTotalGb : null,
    Number.isFinite(storage.diskFreeGb) ? storage.diskFreeGb : null,
    jsonOrNull(macAddresses),
    jsonOrNull(network),
    jsonOrNull(inventory.antivirus),
    jsonOrNull(inventory.localAdmins),
    jsonOrNull(software.slice(0, 500)),
    jsonOrNull(inventory),
    collectedAt
  );
}

const alertTicketMeta = {
  CPU_HIGH: { priority: "CRITICA", title: (a, p) => `CPU crítica em ${a.hostname} (${p}%)` },
  MEMORY_HIGH: { priority: "ALTA", title: (a, p) => `Memória alta em ${a.hostname} (${p}%)` },
  DISK_HIGH: { priority: "ALTA", title: (a, p) => `Disco cheio em ${a.hostname} (${p}%)` },
};

export function maybeCreateAlertTicket(db, asset, alertType, metricValue) {
  const settings = db.prepare("SELECT automatic_tickets_enabled FROM system_settings WHERE organization_id=?").get(asset.organization_id);
  if (settings && !settings.automatic_tickets_enabled) return null;

  const open = db.prepare(`
    SELECT id FROM tickets WHERE asset_id=? AND status!='RESOLVIDO' AND source='MONITOR'
    AND title LIKE ? LIMIT 1
  `).get(asset.id, `%${alertType === "CPU_HIGH" ? "Processador" : alertType === "MEMORY_HIGH" ? "Memória" : "Disco"}%`);
  if (open) return null;

  const meta = alertTicketMeta[alertType];
  if (!meta) return null;

  // Motor de inteligência: traduz o sinal técnico em linguagem simples,
  // com impacto e ações recomendadas, e deriva a prioridade da severidade.
  const insight = explainTelemetry(alertType, asset, metricValue);
  const number = db.prepare("SELECT COALESCE(MAX(number), 1000)+1 AS next FROM tickets").get().next;
  const id = makeId("tkt");
  const now = new Date().toISOString();
  const title = insight.titulo;
  const description = insightToTicketDescription(insight, {
    hostname: asset.hostname,
    logged_user: asset.logged_user,
    ip_address: asset.ip_address,
    metric: `${alertType} = ${metricValue}%`,
  });

  db.prepare(`INSERT INTO tickets
    (id, number, organization_id, branch_id, asset_id, title, description, category, kind, priority, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Monitoramento', 'INCIDENTE', ?, 'ABERTO', 'MONITOR', ?, ?)`)
    .run(id, number, asset.organization_id, asset.branch_id, asset.id, title, description, insight.priority || meta.priority, now, now);
  db.prepare("INSERT INTO ticket_events VALUES (?, ?, NULL, ?, 'CREATED', ?, ?)")
    .run(makeId("evt"), id, asset.hostname, "Chamado aberto automaticamente pelo monitoramento.", now);
  return { id, number, title };
}

export function findPendingRemoteSession(db, assetId) {
  const now = new Date().toISOString();
  const row = db.prepare(`
    SELECT rs.*, t.number ticket_number
    FROM remote_sessions rs
    LEFT JOIN tickets t ON t.id = rs.ticket_id
    WHERE rs.asset_id = ?
      AND rs.status = 'REQUESTED'
      AND rs.consent_required = 1
      AND rs.agent_acknowledged_at IS NULL
      AND (rs.expires_at IS NULL OR rs.expires_at > ?)
    ORDER BY rs.created_at DESC
    LIMIT 1
  `).get(assetId, now);

  if (!row) return null;

  return {
    id: row.id,
    ticketId: row.ticket_id,
    ticketNumber: row.ticket_number,
    provider: row.provider || "NEXUS_WEBRTC",
    requestedByName: row.requested_by_name,
    message: row.ticket_number
      ? `${row.requested_by_name} solicita acesso remoto no chamado #${row.ticket_number}. Clique em Aceitar para compartilhar sua tela pelo navegador.`
      : `${row.requested_by_name} solicita acesso remoto nesta máquina. Clique em Aceitar para compartilhar sua tela.`,
  };
}
