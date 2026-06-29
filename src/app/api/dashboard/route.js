import { getDb } from "@/lib/db";
import { getPermissions, requireCurrentUser, roleLabel } from "@/lib/auth";
import { isActiveTicketStatus, listTicketStatuses } from "@/lib/ticket-statuses";

export const dynamic = "force-dynamic";

const placeholders = (values) => values.map(() => "?").join(",");

export async function GET(request) {
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const permissions = getPermissions(currentUser);
  const requestedBranchId = new URL(request.url).searchParams.get("branchId");
  const allowedBranchIds = permissions.canViewAllBranches
    ? db.prepare("SELECT id FROM branches WHERE organization_id=?").all(currentUser.organization_id).map((item) => item.id)
    : currentUser.branchIds;
  const scopedBranchIds = requestedBranchId && allowedBranchIds.includes(requestedBranchId) ? [requestedBranchId] : allowedBranchIds;
  const scopedBranchClause = scopedBranchIds.length ? ` IN (${placeholders(scopedBranchIds)})` : " IS NULL";
  const allowedBranchClause = allowedBranchIds.length ? ` IN (${placeholders(allowedBranchIds)})` : " IS NULL";
  const ticketConditions = [`t.branch_id${scopedBranchClause}`];
  const ticketParams = [...scopedBranchIds];
  if (currentUser.role === "EMPLOYEE") {
    ticketConditions.push("(t.requester_id = ? OR t.asset_id = ?)");
    ticketParams.push(currentUser.id, currentUser.asset_id || "");
  }
  const branches = db.prepare(`
    SELECT b.*, COUNT(a.id) asset_count,
      SUM(CASE WHEN a.status = 'ONLINE' THEN 1 ELSE 0 END) online_count
    FROM branches b LEFT JOIN assets a ON a.branch_id = b.id
    WHERE b.id${allowedBranchClause}
    GROUP BY b.id ORDER BY CASE b.type WHEN 'MATRIZ' THEN 0 ELSE 1 END, b.name
  `).all(...allowedBranchIds);
  const tickets = db.prepare(`
    SELECT t.*, b.name branch_name, a.hostname, a.mesh_node_id,
      u.name requester_name, u.email requester_email, tt.name ticket_type_name,
      assignee.name assignee_name, team.name team_name
    FROM tickets t JOIN branches b ON b.id=t.branch_id
    LEFT JOIN assets a ON a.id=t.asset_id LEFT JOIN users u ON u.id=t.requester_id
    LEFT JOIN users assignee ON assignee.id=t.assignee_id
    LEFT JOIN teams team ON team.id=t.team_id
    LEFT JOIN ticket_types tt ON tt.id=t.ticket_type_id
    WHERE ${ticketConditions.join(" AND ")} ORDER BY t.updated_at DESC
  `).all(...ticketParams);
  const assets = db.prepare(`
    SELECT a.*, b.name branch_name, b.type branch_type
    FROM assets a JOIN branches b ON b.id=a.branch_id
    WHERE a.branch_id${scopedBranchClause}
    ${currentUser.role === "EMPLOYEE" ? "AND a.id = ?" : ""}
    ORDER BY a.status='ALERT' DESC, a.hostname
  `).all(...scopedBranchIds, ...(currentUser.role === "EMPLOYEE" ? [currentUser.asset_id || ""] : []));
  const networkDevices = currentUser.role === "EMPLOYEE" ? [] : db.prepare(`
    SELECT n.*, b.name branch_name, b.type branch_type
    FROM network_devices n JOIN branches b ON b.id=n.branch_id
    WHERE n.branch_id${scopedBranchClause}
    ORDER BY n.status='ALERTA' DESC, n.status='OFFLINE' DESC, b.name, n.name
  `).all(...scopedBranchIds);
  const ticketStatuses = listTicketStatuses(db, currentUser.organization_id);

  // Alertas XDR/EPP abertos (status='NEW') — só para perfis com canViewAssets.
  // Escopo de organização sempre; e escopo de filial via asset quando houver
  // asset_id vinculado (alertas sem ativo são considerados de toda a organização).
  let xdrAlerts = { count: 0, recent: [] };
  if (permissions.canViewAssets) {
    const xdrConditions = ["x.organization_id=?", "x.status='NEW'"];
    const xdrParams = [currentUser.organization_id];
    if (!permissions.canViewAllBranches) {
      const branchClause = scopedBranchIds.length
        ? `a.branch_id IN (${placeholders(scopedBranchIds)})`
        : "a.branch_id IS NULL";
      // Sem ativo vinculado → visível para o escopo (alerta de organização);
      // com ativo → precisa estar numa filial permitida ao usuário.
      xdrConditions.push(`(x.asset_id IS NULL OR ${branchClause})`);
      xdrParams.push(...scopedBranchIds);
    }
    const whereXdr = xdrConditions.join(" AND ");
    xdrAlerts.count = db.prepare(`
      SELECT COUNT(*) AS total FROM xdr_alerts x
      LEFT JOIN assets a ON a.id=x.asset_id
      WHERE ${whereXdr}
    `).get(...xdrParams).total;
    xdrAlerts.recent = db.prepare(`
      SELECT x.id, x.provider, x.external_id, x.severity, x.title, x.description,
        x.status, x.detected_at, x.created_at, a.hostname, b.name branch_name
      FROM xdr_alerts x
      LEFT JOIN assets a ON a.id=x.asset_id
      LEFT JOIN branches b ON b.id=a.branch_id
      WHERE ${whereXdr}
      ORDER BY x.created_at DESC
      LIMIT 8
    `).all(...xdrParams);
  }
  const stats = {
    openTickets: tickets.filter((ticket) => isActiveTicketStatus(db, currentUser.organization_id, ticket.status)).length,
    critical: tickets.filter((ticket) => ticket.priority === "CRITICA").length,
    assets: assets.length,
    online: assets.filter((asset) => asset.status === "ONLINE").length,
  };
  return Response.json({
    branches, tickets, assets, networkDevices, stats, permissions, permissionMap: currentUser.permissionMap, ticketStatuses, xdrAlerts,
    currentUser: {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
      roleLabel: currentUser.profile?.name || roleLabel(currentUser.role),
      profile: currentUser.profile,
      branchId: currentUser.branch_id,
      branchIds: currentUser.branchIds,
      branchName: currentUser.branch_name,
      organizationId: currentUser.organization_id,
      organizationName: currentUser.organization_name,
      organizationSlug: currentUser.organization_slug,
      appName: currentUser.app_name || "FunevDesk",
      logoUrl: currentUser.logo_url || "",
      primaryColor: currentUser.primary_color || "#102033",
      secondaryColor: currentUser.secondary_color || "#bff2e6",
      navigationMode: currentUser.navigation_mode || "SIDEBAR",
    },
  });
}
