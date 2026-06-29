import { getDb, makeId } from "@/lib/db";
import { getPermissions, requireCurrentUser, can } from "@/lib/auth";
import { isValidHost } from "@/lib/security";
import { z } from "zod";

const hostField = z.string().min(3).max(253).refine(isValidHost, { message: "Endereço IP ou host inválido." });

export const dynamic = "force-dynamic";

const deviceSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(2).max(120),
  deviceType: z.string().min(2).max(80),
  ipAddress: hostField,
  monitorType: z.enum(["PING", "SMB", "FIREWALL", "PRINTER"]).default("PING"),
  vendor: z.string().max(40).optional().default(""),
  checkPorts: z.array(z.number().int().min(1).max(65535)).max(12).optional().default([]),
  snmpCommunity: z.string().max(80).optional().default(""),
  snmpVersion: z.enum(["v1", "v2c"]).optional().default("v1"),
  smbShare: z.string().max(120).optional().default(""),
  status: z.enum(["ONLINE", "ALERTA", "OFFLINE", "DESCONHECIDO"]).default("DESCONHECIDO"),
  latencyMs: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().max(2000).optional().default(""),
  autoTicket: z.boolean().optional().default(false),
  autoTicketToner: z.number().int().min(1).max(100).nullable().optional(),
  autoTicketOnError: z.boolean().optional().default(false),
});

const importRowSchema = z.object({
  name: z.string().min(2).max(120),
  branchId: z.string().min(1),
  deviceType: z.string().min(2).max(80).default("Switch"),
  ipAddress: hostField,
  monitorType: z.enum(["PING", "SMB", "FIREWALL", "PRINTER"]).default("PING"),
  vendor: z.string().max(40).optional().default(""),
  checkPorts: z.string().optional().default(""),
  snmpCommunity: z.string().max(80).optional().default(""),
  smbShare: z.string().max(120).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
});

const importSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(500),
});

function parsePortList(value) {
  if (!value?.trim()) return [];
  return value.split(/[,;]/).map((part) => Number.parseInt(part.trim(), 10)).filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535).slice(0, 12);
}

export async function GET(request) {
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!can(currentUser, "network", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const permissions = getPermissions(currentUser);
  const branchIds = permissions.canViewAllBranches ? db.prepare("SELECT id FROM branches WHERE organization_id=?").all(currentUser.organization_id).map((item) => item.id) : currentUser.branchIds;
  const devices = branchIds.length ? db.prepare(`
    SELECT n.*, b.name branch_name
    FROM network_devices n JOIN branches b ON b.id=n.branch_id
    WHERE n.organization_id=? AND n.branch_id IN (${branchIds.map(() => "?").join(",")})
    ORDER BY n.status='ALERTA' DESC, n.status='OFFLINE' DESC, b.name, n.name
  `).all(currentUser.organization_id, ...branchIds) : [];
  return Response.json({ devices });
}

export async function POST(request) {
  const body = await request.json();
  if (body?.rows) {
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Planilha inválida.", details: parsed.error.flatten() }, { status: 400 });
    const db = getDb();
    const auth = requireCurrentUser(request);
    if (auth.error) return auth.error;
    const currentUser = auth.user;
    if (!getPermissions(currentUser).canConfigure) return Response.json({ error: "Apenas administradores podem importar rede." }, { status: 403 });

    const validBranches = new Set(db.prepare("SELECT id FROM branches WHERE organization_id=?").all(currentUser.organization_id).map((item) => item.id));
    const now = new Date().toISOString();
    let imported = 0;

    const importRows = db.transaction(() => {
      const insert = db.prepare(`INSERT INTO network_devices
        (id, organization_id, branch_id, name, device_type, ip_address, monitor_type, vendor, check_ports_json, snmp_community, smb_share, status, latency_ms, last_seen_at, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DESCONHECIDO', NULL, NULL, ?, ?)`);
      const findExisting = db.prepare("SELECT id FROM network_devices WHERE organization_id=? AND ip_address=? LIMIT 1");

      for (const row of parsed.data.rows) {
        if (!validBranches.has(row.branchId)) throw new Error(`Unidade inválida para ${row.name}.`);
        const ports = parsePortList(row.checkPorts);
        const existing = findExisting.get(currentUser.organization_id, row.ipAddress);
        if (existing) {
          db.prepare(`UPDATE network_devices SET branch_id=?, name=?, device_type=?, monitor_type=?, vendor=?, check_ports_json=?, snmp_community=?, smb_share=?, notes=? WHERE id=?`)
            .run(row.branchId, row.name, row.deviceType, row.monitorType, row.vendor || null, JSON.stringify(ports), row.snmpCommunity || null, row.smbShare || null, row.notes, existing.id);
        } else {
          insert.run(
            makeId("net"),
            currentUser.organization_id,
            row.branchId,
            row.name,
            row.deviceType,
            row.ipAddress,
            row.monitorType,
            row.vendor || null,
            JSON.stringify(ports),
            row.snmpCommunity || null,
            row.smbShare || null,
            row.notes,
            now,
          );
        }
        imported += 1;
      }
    });

    try {
      importRows();
    } catch (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ imported });
  }

  const parsed = deviceSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Dispositivo inválido.", details: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!getPermissions(currentUser).canConfigure) return Response.json({ error: "Apenas administradores podem cadastrar rede." }, { status: 403 });
  const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(parsed.data.branchId, currentUser.organization_id);
  if (!branch) return Response.json({ error: "Unidade inválida." }, { status: 400 });
  const now = new Date().toISOString();
  const id = makeId("net");
  db.prepare(`INSERT INTO network_devices
    (id, organization_id, branch_id, name, device_type, ip_address, monitor_type, vendor, check_ports_json, snmp_community, snmp_version, smb_share, status, latency_ms, last_seen_at, notes, auto_ticket, auto_ticket_toner, auto_ticket_on_error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
      currentUser.organization_id,
      branch.id,
      parsed.data.name,
      parsed.data.deviceType,
      parsed.data.ipAddress,
      parsed.data.monitorType,
      parsed.data.vendor || null,
      JSON.stringify(parsed.data.checkPorts || []),
      parsed.data.snmpCommunity || null,
      parsed.data.snmpVersion || "v1",
      parsed.data.smbShare || null,
      parsed.data.status,
      parsed.data.latencyMs ?? null,
      parsed.data.status === "OFFLINE" ? null : now,
      parsed.data.notes,
      parsed.data.autoTicket ? 1 : 0,
      parsed.data.autoTicketToner ?? null,
      parsed.data.autoTicketOnError ? 1 : 0,
      now,
    );
  return Response.json({ id }, { status: 201 });
}
