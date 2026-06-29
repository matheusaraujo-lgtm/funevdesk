import { getDb } from "@/lib/db";

const BRANDING_COLUMNS = `
  o.id, o.name, o.slug, s.app_name, s.logo_url, s.primary_color, s.secondary_color, s.navigation_mode
  FROM organizations o
  LEFT JOIN system_settings s ON s.organization_id=o.id
`;

function toBranding(org) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    appName: org.app_name || "FunevDesk",
    logoUrl: org.logo_url || "",
    primaryColor: org.primary_color || "#102033",
    secondaryColor: org.secondary_color || "#bff2e6",
    navigationMode: org.navigation_mode || "SIDEBAR",
  };
}

// ISOLAMENTO MULTI-TENANT: este endpoint é PÚBLICO (tela de login). Por isso NÃO enumeramos
// todas as organizações — isso vazaria a carteira de clientes para qualquer um na internet.
// Com ?slug= retornamos só a empresa pedida (para aplicar o branding no login). Sem slug,
// só auto-resolvemos quando há exatamente UMA organização (deployment single-tenant). Em
// ambiente multi-tenant sem slug, devolvemos lista vazia + requiresSlug para a UI pedir o código.
export async function GET(request) {
  const db = getDb();
  const slug = new URL(request.url).searchParams.get("slug");

  if (slug) {
    const org = db.prepare(`SELECT ${BRANDING_COLUMNS} WHERE o.slug=?`).get(slug);
    return Response.json({ organizations: org ? [toBranding(org)] : [], requiresSlug: false });
  }

  const count = db.prepare("SELECT COUNT(*) AS n FROM organizations").get().n;
  if (count === 1) {
    const org = db.prepare(`SELECT ${BRANDING_COLUMNS}`).get();
    return Response.json({ organizations: org ? [toBranding(org)] : [], requiresSlug: false });
  }
  return Response.json({ organizations: [], requiresSlug: count > 1 });
}
