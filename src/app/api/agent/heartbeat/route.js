import { getDb, makeId } from "@/lib/db";
import {
  findAssetByToken,
  findOrganizationByEnrollmentKey,
  findPendingRemoteSession,
  generateAgentToken,
  maybeCreateAlertTicket,
  saveAssetInventory,
  upsertAssetFromTelemetry,
} from "@/lib/agent";
import { recordAssetMetric } from "@/lib/telemetry";
import { ingestDefenderThreats, ingestPostureAlerts } from "@/lib/security-analyst";
import { z } from "zod";

export const dynamic = "force-dynamic";

const heartbeatSchema = z.object({
  hostname: z.string().min(1),
  osName: z.string().optional(),
  ipAddress: z.string().optional(),
  loggedUser: z.string().optional(),
  domain: z.string().optional(),
  serialNumber: z.string().optional(),
  machineUuid: z.string().optional(),
  cpuPercent: z.number().min(0).max(100),
  memoryPercent: z.number().min(0).max(100),
  diskPercent: z.number().min(0).max(100),
  // Inventário aceito de forma TOLERANTE: o agente (WMI/PowerShell) frequentemente envia
  // null/strings em campos numéricos. Um schema estrito rejeitava o heartbeat inteiro (400)
  // e o inventário nunca era salvo. `saveAssetInventory` já sanitiza os dados com segurança
  // (Number.isFinite, fatiamento de software, JSON defensivo), então aqui só garantimos que
  // seja um objeto — sem barrar a telemetria por causa de um campo divergente.
  inventory: z.record(z.string(), z.any()).optional(),
  // Versão do agente (gestão de frota) e resultados de comandos de resposta a incidente.
  // Sem declará-los aqui, o Zod os removia do payload e o servidor nunca os via.
  agentVersion: z.string().max(40).optional(),
  commandResults: z.array(z.object({
    id: z.string(),
    status: z.string().optional(),
    ok: z.boolean().optional(),
    result: z.string().optional(),
  })).optional(),
});

export async function POST(request) {
  const token = request.headers.get("x-agent-token")?.trim();
  if (!token) return Response.json({ error: "Token do agente ausente." }, { status: 401 });

  const parsed = heartbeatSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Telemetria inválida." }, { status: 400 });

  const db = getDb();
  const data = parsed.data;
  let asset = findAssetByToken(db, token);
  let agentToken = token;
  let enrolled = false;

  if (!asset) {
    const org = findOrganizationByEnrollmentKey(db, token);
    if (!org) return Response.json({ error: "Agente não autorizado." }, { status: 401 });
    agentToken = generateAgentToken();
    asset = upsertAssetFromTelemetry(db, org.organization_id, null, data, agentToken);
    if (!asset) return Response.json({ error: "Não foi possível registrar o ativo." }, { status: 500 });
    enrolled = true;
  } else {
    const now = new Date().toISOString();
    const status = data.cpuPercent >= 90 || data.memoryPercent >= 95 || data.diskPercent >= 90 ? "ALERT" : "ONLINE";
    db.prepare(`UPDATE assets SET hostname=?, os_name=?, ip_address=?, logged_user=?, status=?,
      cpu_percent=?, memory_percent=?, disk_percent=?, last_seen_at=?, agent_domain=?, serial_number=?, machine_uuid=?, agent_version=? WHERE id=?`)
      .run(
        data.hostname, data.osName || asset.os_name, data.ipAddress || asset.ip_address,
        data.loggedUser || asset.logged_user, status, data.cpuPercent, data.memoryPercent, data.diskPercent,
        now, data.domain || asset.agent_domain, data.serialNumber || asset.serial_number,
        data.machineUuid || asset.machine_uuid, data.agentVersion || asset.agent_version, asset.id
      );
    asset = db.prepare("SELECT * FROM assets WHERE id=?").get(asset.id);
  }

  // Ponto histórico de telemetria (série temporal) — não substitui o upsert acima.
  recordAssetMetric(db, asset.id, {
    cpuPercent: data.cpuPercent,
    memoryPercent: data.memoryPercent,
    diskPercent: data.diskPercent,
    status: asset.status,
  });

  if (data.inventory) {
    saveAssetInventory(db, asset.id, data.inventory);
    // EPP funcional: ameaças reais do Defender viram alertas na Central de Segurança.
    if (data.inventory.epp) {
      try { ingestDefenderThreats(db, asset, data.inventory.epp); } catch { /* não bloqueia o heartbeat */ }
      // Postura ruim (sem AV, tamper/realtime off, assinatura velha) também vira alerta.
      try { ingestPostureAlerts(db, asset, data.inventory.epp); } catch { /* não bloqueia o heartbeat */ }
    }
  }

  const alerts = [];
  const ticketsCreated = [];
  for (const [alertType, triggered, metricValue] of [
    ["CPU_HIGH", data.cpuPercent >= 90, data.cpuPercent],
    ["MEMORY_HIGH", data.memoryPercent >= 95, data.memoryPercent],
    ["DISK_HIGH", data.diskPercent >= 90, data.diskPercent],
  ]) {
    if (!triggered) continue;
    const ticket = maybeCreateAlertTicket(db, asset, alertType, metricValue);
    if (ticket) ticketsCreated.push(ticket);

    const recent = db.prepare("SELECT id FROM alerts WHERE asset_id=? AND alert_type=? AND status='OPEN'").get(asset.id, alertType);
    if (!recent) {
      db.prepare("INSERT INTO alerts VALUES (?, ?, ?, ?, ?, ?, 'OPEN', NULL, ?)")
        .run(makeId("alt"), asset.id, asset.branch_id, alertType, alertType === "CPU_HIGH" ? "CRITICA" : "ALTA", `${alertType} detectado`, new Date().toISOString());
      alerts.push(alertType);
    }
  }

  // Resposta a incidente: o agente reporta o resultado dos comandos executados…
  if (Array.isArray(data.commandResults)) {
    const nowR = new Date().toISOString();
    const upd = db.prepare("UPDATE agent_commands SET status=?, result=?, completed_at=? WHERE id=? AND asset_id=?");
    for (const cr of data.commandResults.slice(0, 20)) {
      if (!cr?.id) continue;
      const ok = cr.status === "DONE" || cr.ok === true;
      upd.run(ok ? "DONE" : "FAILED", String(cr.result || "").slice(0, 1000), nowR, String(cr.id), asset.id);
    }
  }
  // Expira comandos pendentes antigos (TTL 1h) ANTES de despachar: um comando de ação física
  // como ISOLATE/SCAN enfileirado e não entregue (agente offline por dias) NÃO deve disparar
  // sozinho quando o equipamento reconecta — seria uma ação obsoleta e potencialmente perigosa.
  const ttlCutoff = new Date(Date.now() - 3600000).toISOString();
  db.prepare("UPDATE agent_commands SET status='EXPIRED', completed_at=? WHERE asset_id=? AND status='PENDING' AND created_at < ?")
    .run(new Date().toISOString(), asset.id, ttlCutoff);
  // …e busca os comandos pendentes recentes para executar (marca como enviados).
  const pendingCommands = db.prepare("SELECT id, command, params_json FROM agent_commands WHERE asset_id=? AND status='PENDING' ORDER BY created_at LIMIT 5").all(asset.id);
  if (pendingCommands.length) {
    db.prepare("UPDATE agent_commands SET status='SENT' WHERE asset_id=? AND status='PENDING'").run(asset.id);
  }

  const status = asset.status;
  const now = new Date().toISOString();
  const pendingRemote = findPendingRemoteSession(db, asset.id);
  return Response.json({
    ok: true,
    status,
    alerts,
    ticketsCreated,
    serverTime: now,
    ...(pendingRemote ? { pendingRemote } : {}),
    ...(pendingCommands.length ? { commands: pendingCommands.map((c) => ({ id: c.id, command: c.command, params: c.params_json ? JSON.parse(c.params_json) : null })) } : {}),
    ...(enrolled || agentToken !== token ? { agentToken, enrolled: true } : {}),
  });
}
