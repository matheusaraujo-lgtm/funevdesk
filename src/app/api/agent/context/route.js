import { findAssetByToken } from "@/lib/agent";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const token = request.headers.get("x-agent-token")?.trim();
  if (!token) return Response.json({ error: "Token do agente ausente." }, { status: 401 });

  const db = getDb();
  const asset = findAssetByToken(db, token);
  if (!asset) return Response.json({ error: "Agente não autorizado." }, { status: 401 });

  const branch = db.prepare("SELECT id, name, type, city, state FROM branches WHERE id=?").get(asset.branch_id);
  const branches = db.prepare(`
    SELECT id, name, type, city, state FROM branches
    WHERE organization_id=? ORDER BY CASE type WHEN 'MATRIZ' THEN 0 ELSE 1 END, name
  `).all(asset.organization_id);
  const locations = db.prepare(`
    SELECT l.id, l.name, l.code, l.branch_id
    FROM locations l
    WHERE l.organization_id=? AND l.active=1
    ORDER BY l.branch_id, l.name
  `).all(asset.organization_id);

  const settings = db.prepare(
    "SELECT app_name, logo_url, primary_color FROM system_settings WHERE organization_id=?",
  ).get(asset.organization_id);

  return Response.json({
    branding: {
      appName: settings?.app_name || "FunevDesk",
      logoUrl: settings?.logo_url || "",
      primaryColor: settings?.primary_color || "#102033",
    },
    asset: {
      id: asset.id,
      hostname: asset.hostname,
      loggedUser: asset.logged_user,
      ipAddress: asset.ip_address,
      osName: asset.os_name,
      branchId: asset.branch_id,
      serialNumber: asset.serial_number,
    },
    branch,
    branches,
    locations,
  });
}
