import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getAssetMetrics } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

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

  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const hoursParam = url.searchParams.get("hours");

  let since;
  if (sinceParam) {
    const parsed = new Date(sinceParam);
    if (!Number.isNaN(parsed.getTime())) since = parsed.toISOString();
  } else if (hoursParam) {
    const hours = Number(hoursParam);
    if (Number.isFinite(hours) && hours > 0) {
      since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    }
  }

  const metrics = getAssetMetrics(db, id, { since });
  return Response.json({
    metrics: metrics.map((point) => ({
      cpuPercent: point.cpu_percent,
      memoryPercent: point.memory_percent,
      diskPercent: point.disk_percent,
      status: point.status,
      collectedAt: point.collected_at,
    })),
  });
}
