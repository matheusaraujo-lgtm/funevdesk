import bcrypt from "bcryptjs";
import { createSession, sessionCookie } from "@/lib/auth";
import { authenticateLdap, getBranchAuthSettings } from "@/lib/ldap";
import { getDb } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/security";
import { z } from "zod";

export async function POST(request) {
  const parsed = z.object({
    email: z.string().trim().min(3).max(120),
    password: z.string().min(1),
    organizationSlug: z.string().min(2).max(80).optional(),
  }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Informe e-mail e senha." }, { status: 400 });

  // Anti brute force / credential stuffing: limita por IP e por e-mail.
  const ip = clientIp(request);
  const ipLimit = rateLimit(`login:ip:${ip}`, { limit: 20, windowMs: 5 * 60_000 });
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterMs);
  const emailLimit = rateLimit(`login:email:${parsed.data.email.toLowerCase()}`, { limit: 8, windowMs: 5 * 60_000 });
  if (!emailLimit.allowed) return tooManyRequests(emailLimit.retryAfterMs);

  const db = getDb();
  const email = parsed.data.email.toLowerCase();
  const organization = parsed.data.organizationSlug
    ? db.prepare("SELECT o.id, o.name, o.slug, s.app_name, s.logo_url, s.primary_color, s.secondary_color, s.navigation_mode FROM organizations o LEFT JOIN system_settings s ON s.organization_id=o.id WHERE o.slug=?").get(parsed.data.organizationSlug)
    : db.prepare("SELECT o.id, o.name, o.slug, s.app_name, s.logo_url, s.primary_color, s.secondary_color, s.navigation_mode FROM organizations o LEFT JOIN system_settings s ON s.organization_id=o.id ORDER BY o.created_at LIMIT 1").get();
  if (!organization) return Response.json({ error: "Empresa não encontrada." }, { status: 404 });

  const user = db.prepare(`
    SELECT id, name, email, role, active, password_hash, password_reset_required, auth_provider, branch_id, organization_id
    FROM users WHERE organization_id=? AND email=?
  `).get(organization.id, email);

  if (!user || !user.active) {
    return Response.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  const authProvider = user.auth_provider || "LOCAL";
  if (authProvider === "LDAP") {
    const settings = getBranchAuthSettings(db, user.branch_id);
    const ldapResult = await authenticateLdap(settings, email, parsed.data.password);
    if (!ldapResult.ok) return Response.json({ error: ldapResult.error || "Falha na autenticação LDAP." }, { status: 401 });
    if (ldapResult.profile?.dn) {
      db.prepare("UPDATE users SET external_id=? WHERE id=?").run(ldapResult.profile.dn, user.id);
    }
  } else {
    if (!user.password_hash || !await bcrypt.compare(parsed.data.password, user.password_hash)) {
      return Response.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
    }
  }

  const session = createSession(user.id);
  return Response.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      appName: organization.app_name || "FunevDesk",
      logoUrl: organization.logo_url || "",
      primaryColor: organization.primary_color || "#102033",
      secondaryColor: organization.secondary_color || "#bff2e6",
      navigationMode: organization.navigation_mode || "SIDEBAR",
    },
    passwordChangeRequired: authProvider === "LOCAL" && Boolean(user.password_reset_required),
  }, { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) } });
}
