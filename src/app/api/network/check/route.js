import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { checkNetworkDevice } from "@/lib/network-monitor";
import { maybeOpenPrinterTicket } from "@/lib/printer-alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const permissions = getPermissions(currentUser);
  if (!permissions.canManageTickets) return Response.json({ error: "Acesso restrito à equipe de suporte." }, { status: 403 });

  const branchIds = permissions.canViewAllBranches
    ? db.prepare("SELECT id FROM branches WHERE organization_id=?").all(currentUser.organization_id).map((item) => item.id)
    : currentUser.branchIds;
  if (!branchIds.length) return Response.json({ checked: 0, devices: [] });

  const devices = db.prepare(`
    SELECT n.*, b.name branch_name
    FROM network_devices n JOIN branches b ON b.id=n.branch_id
    WHERE n.organization_id=? AND n.branch_id IN (${branchIds.map(() => "?").join(",")})
    ORDER BY b.name, n.name
  `).all(currentUser.organization_id, ...branchIds);

  const now = new Date().toISOString();
  const update = db.prepare(`
    UPDATE network_devices
    SET status=?, latency_ms=?, last_seen_at=?, metrics_json=?, last_error=?
    WHERE id=? AND organization_id=?
  `);
  const checked = [];
  for (const device of devices) {
    const result = await checkNetworkDevice(device);
    const lastSeenAt = result.reachable ? now : device.last_seen_at;
    const metricsJson = JSON.stringify(result.metrics);
    update.run(result.status, result.latencyMs, lastSeenAt, metricsJson, result.lastError || null, device.id, currentUser.organization_id);
    // Abertura automática de chamado conforme a configuração da impressora (não bloqueia a verificação).
    if (device.monitor_type === "PRINTER" && device.auto_ticket) {
      try { maybeOpenPrinterTicket(db, device, result); } catch { /* falha no auto-chamado não interrompe a verificação */ }
    }
    checked.push({
      ...device,
      status: result.status,
      latency_ms: result.latencyMs,
      last_seen_at: lastSeenAt,
      metrics_json: metricsJson,
      last_error: result.lastError || null,
    });
  }

  return Response.json({ checked: checked.length, devices: checked, checkedAt: now });
}
