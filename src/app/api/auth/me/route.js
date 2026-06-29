import { getCurrentUser, getPermissions, roleLabel } from "@/lib/auth";
import { MODULES } from "@/lib/permissions";

export async function GET(request) {
  const user = getCurrentUser(request);
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  return Response.json({
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      roleLabel: user.profile?.name || roleLabel(user.role), branchId: user.branch_id, branchIds: user.branchIds,
      branchName: user.branch_name,
      profile: user.profile,
      organizationId: user.organization_id,
      organizationName: user.organization_name,
      organizationSlug: user.organization_slug,
      appName: user.app_name || "FunevDesk",
      logoUrl: user.logo_url || "",
      primaryColor: user.primary_color || "#102033",
      secondaryColor: user.secondary_color || "#bff2e6",
      navigationMode: user.navigation_mode || "SIDEBAR",
    },
    permissions: getPermissions(user),
    permissionMap: user.permissionMap,
    modules: MODULES,
    passwordChangeRequired: Boolean(user.password_reset_required),
  });
}
