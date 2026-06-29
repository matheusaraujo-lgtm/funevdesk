import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const permissions = getPermissions(auth.user);
  if (!permissions.canViewAssets) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }

  const db = getDb();
  const asset = db.prepare("SELECT id, branch_id FROM assets WHERE id=? AND organization_id=?")
    .get(id, auth.user.organization_id);
  if (!asset) return Response.json({ error: "Ativo não encontrado." }, { status: 404 });
  if (!permissions.canViewAllBranches && !auth.user.branchIds?.includes(asset.branch_id)) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }

  const inventory = db.prepare("SELECT * FROM asset_inventory WHERE asset_id=?").get(id);
  if (!inventory) return Response.json({ inventory: null });

  const raw = parseJson(inventory.raw_json, {});

  return Response.json({
    inventory: {
      manufacturer: inventory.manufacturer,
      model: inventory.model,
      biosVersion: inventory.bios_version,
      processorName: inventory.processor_name,
      cpuCores: inventory.cpu_cores,
      cpuLogicalProcessors: inventory.cpu_logical_processors,
      memoryTotalGb: inventory.memory_total_gb,
      diskTotalGb: inventory.disk_total_gb,
      diskFreeGb: inventory.disk_free_gb,
      macAddresses: parseJson(inventory.mac_addresses_json, []),
      networkAdapters: parseJson(inventory.network_adapters_json, []),
      antivirus: parseJson(inventory.antivirus_json, []),
      localAdmins: parseJson(inventory.local_admins_json, []),
      installedSoftware: parseJson(inventory.installed_software_json, []),
      security: raw.security || null,
      collectedAt: inventory.collected_at,
    },
  });
}
