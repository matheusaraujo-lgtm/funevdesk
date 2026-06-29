import crypto from "node:crypto";
import { getDb, makeId } from "@/lib/db";
import { can as canModule, buildPermissionMap, defaultMatrixForRole } from "@/lib/permissions";

export const sessionCookieName = "nexus_session";
const sessionDurationMs = 8 * 60 * 60 * 1000;

function parseCookies(request) {
  return Object.fromEntries((request.headers.get("cookie") || "").split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf("=");
    return [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
  }));
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function loadUser(db, id) {
  const user = db.prepare(`
    SELECT u.*, b.name branch_name, b.type branch_type, o.name organization_name, o.slug organization_slug,
      s.app_name, s.logo_url, s.primary_color, s.secondary_color, s.navigation_mode
    FROM users u
    LEFT JOIN branches b ON b.id=u.branch_id
    LEFT JOIN organizations o ON o.id=u.organization_id
    LEFT JOIN system_settings s ON s.organization_id=u.organization_id
    WHERE u.id=? AND COALESCE(u.active, 1)=1
  `).get(id);
  if (!user) return null;
  const branchIds = db.prepare("SELECT branch_id FROM user_branches WHERE user_id=? ORDER BY is_primary DESC").all(user.id).map((item) => item.branch_id);

  // Perfil + matriz de permissões granular (estilo GLPI). O role passa a ser derivado
  // do perfil (base_role) para que o escopo por unidade e o portal continuem corretos.
  let profile = null;
  let permissionMap;
  if (user.profile_id) {
    profile = db.prepare("SELECT id, name, slug, base_role FROM profiles WHERE id=?").get(user.profile_id);
  }
  if (profile) {
    const rows = db.prepare("SELECT module, can_read, can_create, can_update, can_delete FROM profile_permissions WHERE profile_id=?").all(profile.id);
    permissionMap = buildPermissionMap(rows);
  } else {
    permissionMap = defaultMatrixForRole(user.role);
  }
  const role = profile?.base_role || user.role;

  return {
    ...user,
    role,
    profile: profile ? { id: profile.id, name: profile.name, slug: profile.slug, baseRole: profile.base_role } : null,
    permissionMap,
    branchIds: branchIds.length ? branchIds : [user.branch_id].filter(Boolean),
  };
}

export function getCurrentUser(request) {
  const token = parseCookies(request)[sessionCookieName];
  if (!token) return null;
  const db = getDb();
  const session = db.prepare("SELECT * FROM user_sessions WHERE token_hash=? AND expires_at>?").get(tokenHash(token), new Date().toISOString());
  if (!session) return null;
  return loadUser(db, session.user_id);
}

export function requireCurrentUser(request) {
  const user = getCurrentUser(request);
  if (!user) return { error: Response.json({ error: "Não autenticado." }, { status: 401 }) };
  if (user.password_reset_required && !new URL(request.url).pathname.endsWith("/api/auth/change-password")) {
    return { error: Response.json({ error: "Troca de senha obrigatória.", code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 }) };
  }
  return { user };
}

export function createSession(userId) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  db.prepare("INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(makeId("ses"), userId, tokenHash(token), expiresAt.toISOString(), new Date().toISOString());
  return { token, expiresAt };
}

export function destroySession(request) {
  const token = parseCookies(request)[sessionCookieName];
  if (token) getDb().prepare("DELETE FROM user_sessions WHERE token_hash=?").run(tokenHash(token));
}

// Secure por padrão em produção; desativável com SESSION_COOKIE_SECURE=false (dev/http).
function cookieSecureFlag() {
  if (process.env.SESSION_COOKIE_SECURE === "false") return "";
  if (process.env.SESSION_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production") return "; Secure";
  return "";
}

export function sessionCookie(token, expiresAt) {
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${cookieSecureFlag()}`;
}

export function clearSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecureFlag()}`;
}

// Checagem granular por módulo/ação a partir da matriz do perfil.
export function can(user, module, action = "read") {
  return canModule(user, module, action);
}

// As flags coarse abaixo são derivadas da matriz do perfil — assim as ~60 rotas e a
// navegação existentes passam a respeitar as permissões granulares sem reescrita.
// O escopo por unidade (canViewAllBranches/canSelectBranches/isEmployee) permanece
// derivado do role (= base_role do perfil), preservando o isolamento por filial.
export function getPermissions(user) {
  const isAdmin = user.role === "ADMIN";
  const canConfigure = can(user, "settings", "read");
  return {
    canViewAllBranches: isAdmin,
    canSelectBranches: isAdmin || user.branchIds.length > 1,
    // "Gerenciar chamados" = papel de atendente/gestor (atualiza/atribui), não apenas abrir o próprio.
    // Por isso deriva de update — criar o próprio chamado (tickets:create) não concede gestão.
    canManageTickets: can(user, "tickets", "update"),
    canRemoteAccess: can(user, "remote", "read"),
    canViewAssets: can(user, "assets", "read"),
    canConfigure,
    canViewReports: can(user, "reports", "read"),
    canViewAudit: can(user, "audit", "read"),
    canManageTeams: can(user, "teams", "update"),
    canViewBranchAdministration: can(user, "users", "read") || canConfigure,
    isEmployee: user.role === "EMPLOYEE",
  };
}

// Helper de autorização para rotas: exige sessão + permissão granular no módulo/ação.
export function requirePermission(request, module, action = "read") {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth;
  if (!can(auth.user, module, action)) {
    return { error: Response.json({ error: "Acesso negado para esta operação." }, { status: 403 }) };
  }
  return auth;
}

// Patente dos papéis para barrar escalonamento de privilégio. ADMIN > TÉCNICO > USUÁRIO.
const ROLE_RANK = { EMPLOYEE: 1, TECHNICIAN: 2, ADMIN: 3 };
export function roleRank(role) {
  return ROLE_RANK[role] || 0;
}

// Um ator só pode gerenciar (editar/desativar/excluir/criar) um usuário de patente
// ESTRITAMENTE inferior à sua; ADMIN gerencia qualquer um. Impede, por exemplo, que um
// Técnico exclua um Administrador, mesmo que a matriz conceda users:delete por engano.
export function canManageUser(actor, targetRole) {
  if (actor.role === "ADMIN") return true;
  return roleRank(actor.role) > roleRank(targetRole);
}

export function canAccessTicket(user, ticket) {
  if (user.organization_id !== ticket.organization_id) return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "TECHNICIAN") return user.branchIds.includes(ticket.branch_id);
  if (ticket.requester_id === user.id) return true;
  if (user.asset_id && ticket.asset_id === user.asset_id) return true;
  return false;
}

export function roleLabel(role) {
  return { ADMIN: "Administrador", TECHNICIAN: "Técnico", EMPLOYEE: "Usuário" }[role] || role;
}
