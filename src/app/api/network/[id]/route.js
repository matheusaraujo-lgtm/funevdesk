import { getDb } from "@/lib/db";
import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(2).max(120),
  deviceType: z.string().min(2).max(80),
  ipAddress: z.string().min(3).max(80),
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

export async function PUT(request, { params }) {
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dispositivo inválido.", details: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!getPermissions(currentUser).canConfigure) return Response.json({ error: "Apenas administradores podem editar rede." }, { status: 403 });
  const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(parsed.data.branchId, currentUser.organization_id);
  if (!branch) return Response.json({ error: "Unidade inválida." }, { status: 400 });

  const result = db.prepare(`
    UPDATE network_devices
    SET branch_id=?, name=?, device_type=?, ip_address=?, monitor_type=?, vendor=?, check_ports_json=?, snmp_community=?, snmp_version=?, smb_share=?, status=?, latency_ms=?, last_seen_at=?, notes=?, auto_ticket=?, auto_ticket_toner=?, auto_ticket_on_error=?
    WHERE id=? AND organization_id=?
  `).run(
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
    parsed.data.status === "OFFLINE" ? null : new Date().toISOString(),
    parsed.data.notes,
    parsed.data.autoTicket ? 1 : 0,
    parsed.data.autoTicketToner ?? null,
    parsed.data.autoTicketOnError ? 1 : 0,
    id,
    currentUser.organization_id,
  );
  if (!result.changes) return Response.json({ error: "Dispositivo não encontrado." }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!getPermissions(currentUser).canConfigure) return Response.json({ error: "Apenas administradores podem excluir rede." }, { status: 403 });
  const result = db.prepare("DELETE FROM network_devices WHERE id=? AND organization_id=?").run(id, currentUser.organization_id);
  if (!result.changes) return Response.json({ error: "Dispositivo não encontrado." }, { status: 404 });
  return Response.json({ ok: true });
}
