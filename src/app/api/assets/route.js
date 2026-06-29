import { getDb, makeId } from "@/lib/db";
import { requireCurrentUser, can } from "@/lib/auth";
import { branchFilterClause, getAllowedBranchIds } from "@/lib/branch-scope";
import { z } from "zod";

export const dynamic = "force-dynamic";

const rowSchema = z.object({
  hostname: z.string().min(1),
  branchId: z.string().min(1),
  assetType: z.string().min(1).default("DESKTOP"),
  equipmentType: z.string().min(1).default("DESKTOP"),
  patrimonyNumber: z.string().optional().default(""),
  osName: z.string().optional().default(""),
  ipAddress: z.string().optional().default(""),
  loggedUser: z.string().optional().default(""),
  status: z.enum(["ONLINE", "ALERT", "OFFLINE"]).default("OFFLINE"),
});

const importSchema = z.object({
  rows: z.array(rowSchema).min(1),
});

export async function GET(request) {
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!can(currentUser, "assets", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");

  if (mode === "template") {
    const branches = db.prepare("SELECT id, name FROM branches WHERE organization_id=? ORDER BY name").all(currentUser.organization_id);
    return Response.json({
      columns: ["hostname", "branchId", "assetType", "equipmentType", "patrimonyNumber", "osName", "ipAddress", "loggedUser", "status"],
      example: {
        hostname: "NB-FIN-001",
        branchId: branches[0]?.id || "ID_DA_UNIDADE",
        assetType: "NOTEBOOK",
        equipmentType: "Notebook corporativo",
        patrimonyNumber: "PAT-0001",
        osName: "Windows 11 Pro",
        ipAddress: "10.0.0.50",
        loggedUser: "usuario.sobrenome",
        status: "ONLINE",
      },
      branches,
      allowedStatus: ["ONLINE", "ALERT", "OFFLINE"],
      allowedAssetTypes: ["NOTEBOOK", "DESKTOP", "SERVIDOR", "IMPRESSORA", "REDE"],
    });
  }

  const requestedBranchId = url.searchParams.get("branchId");
  const scopedBranchIds = getAllowedBranchIds(currentUser, db, requestedBranchId || null);
  const branchScope = branchFilterClause(scopedBranchIds, "a.branch_id");

  const assets = db.prepare(`
    SELECT a.*, b.name branch_name
    FROM assets a JOIN branches b ON b.id=a.branch_id
    WHERE a.organization_id=? AND ${branchScope.clause}
    ORDER BY b.name, a.hostname
  `).all(currentUser.organization_id, ...branchScope.params);
  return Response.json({ assets });
}

export async function POST(request) {
  const parsed = importSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Planilha inválida.", details: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!can(currentUser, "assets", "create")) return Response.json({ error: "Sem permissão para importar ativos." }, { status: 403 });

  const validBranches = new Set(db.prepare("SELECT id FROM branches WHERE organization_id=?").all(currentUser.organization_id).map((item) => item.id));
  const now = new Date().toISOString();
  let imported = 0;
  const importRows = db.transaction(() => {
    const insert = db.prepare(`
      INSERT INTO assets
        (id, organization_id, branch_id, hostname, asset_type, equipment_type, patrimony_number, os_name, ip_address, logged_user, status, cpu_percent, memory_percent, disk_percent, last_seen_at, agent_token, mesh_node_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, NULL, NULL, ?)
    `);
    const update = db.prepare(`
      UPDATE assets SET branch_id=?, asset_type=?, equipment_type=?, patrimony_number=?,
        os_name=?, ip_address=?, logged_user=?, status=?, last_seen_at=?
      WHERE id=?
    `);
    const findExisting = db.prepare("SELECT id FROM assets WHERE organization_id=? AND hostname=? LIMIT 1");
    for (const row of parsed.data.rows) {
      if (!validBranches.has(row.branchId)) throw new Error(`Unidade inválida para ${row.hostname}.`);
      const lastSeen = row.status === "OFFLINE" ? null : now;
      const existing = findExisting.get(currentUser.organization_id, row.hostname);
      if (existing) {
        update.run(row.branchId, row.assetType, row.equipmentType, row.patrimonyNumber || null, row.osName || null, row.ipAddress || null, row.loggedUser || null, row.status, lastSeen, existing.id);
      } else {
        insert.run(
        makeId("ast"),
        currentUser.organization_id,
        row.branchId,
        row.hostname,
        row.assetType,
        row.equipmentType,
        row.patrimonyNumber || null,
        row.osName || null,
        row.ipAddress || null,
        row.loggedUser || null,
        row.status,
        lastSeen,
        now
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
