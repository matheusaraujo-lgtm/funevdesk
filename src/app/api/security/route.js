import { getDb } from "@/lib/db";
import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { listConnectors } from "@/lib/xdr-connectors";

export const dynamic = "force-dynamic";

const placeholders = (values) => values.map(() => "?").join(",");

/**
 * Central de Segurança — lista os alertas de XDR/EPP ingeridos (xdr_alerts),
 * com escopo por unidade, contadores por status/severidade e o estado dos
 * conectores configurados. Só para perfis com canViewAssets.
 */
export async function GET(request) {
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const permissions = getPermissions(currentUser);
  if (!permissions.canViewAssets) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const conditions = ["x.organization_id=?"];
  const params = [currentUser.organization_id];
  if (!permissions.canViewAllBranches) {
    const branchIds = currentUser.branchIds || [];
    const branchClause = branchIds.length ? `a.branch_id IN (${placeholders(branchIds)})` : "a.branch_id IS NULL";
    conditions.push(`(x.asset_id IS NULL OR ${branchClause})`);
    params.push(...branchIds);
  }
  const where = conditions.join(" AND ");

  const alerts = db.prepare(`
    SELECT x.id, x.provider, x.external_id, x.severity, x.title, x.description,
      x.status, x.detected_at, x.created_at, x.ticket_id, x.asset_id,
      a.hostname, b.name branch_name, t.number ticket_number, t.status ticket_status
    FROM xdr_alerts x
    LEFT JOIN assets a ON a.id=x.asset_id
    LEFT JOIN branches b ON b.id=a.branch_id
    LEFT JOIN tickets t ON t.id=x.ticket_id
    WHERE ${where}
    ORDER BY
      CASE x.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
      x.created_at DESC
    LIMIT 200
  `).all(...params);

  const byStatus = db.prepare(`
    SELECT x.status, COUNT(*) total FROM xdr_alerts x
    LEFT JOIN assets a ON a.id=x.asset_id
    WHERE ${where} GROUP BY x.status
  `).all(...params).reduce((acc, row) => ({ ...acc, [row.status]: row.total }), {});

  const bySeverity = db.prepare(`
    SELECT x.severity, COUNT(*) total FROM xdr_alerts x
    LEFT JOIN assets a ON a.id=x.asset_id
    WHERE ${where} AND x.status='NEW' GROUP BY x.severity
  `).all(...params).reduce((acc, row) => ({ ...acc, [row.severity]: row.total }), {});

  const connectors = listConnectors().map((connector) => ({
    name: connector.name,
    label: connector.label,
    configured: connector.isConfigured(),
  }));

  return Response.json({
    alerts,
    counts: { byStatus, bySeverity, total: alerts.length },
    connectors,
    ingestConfigured: Boolean(process.env.XDR_INGEST_SECRET),
    aiEnabled: Boolean(process.env.DEEPSEEK_API_KEY),
    permissions: { canManageTickets: permissions.canManageTickets },
  });
}
