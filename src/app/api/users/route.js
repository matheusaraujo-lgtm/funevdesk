import { requireCurrentUser, roleLabel, getPermissions, can, canManageUser } from "@/lib/auth";
import { getAllowedBranchIds } from "@/lib/branch-scope";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const userSchema = z.object({
  name: z.string().min(3).max(120),
  email: z.string().email().max(180),
  role: z.enum(["ADMIN", "TECHNICIAN", "EMPLOYEE"]).optional(),
  profileId: z.string().min(1).optional(),
  branchIds: z.array(z.string().min(1)).min(1),
  primaryBranchId: z.string().min(1),
  assetId: z.string().nullable().optional(),
  authProvider: z.enum(["LOCAL", "LDAP"]).optional().default("LOCAL"),
});

// Resolve perfil + role efetivo. Aceita profileId (novo) ou role (legado); o role é
// derivado do base_role do perfil quando há perfil. Retorna { error } ou { profileId, role }.
function resolveProfile(db, organizationId, data) {
  if (data.profileId) {
    const profile = db.prepare("SELECT id, base_role FROM profiles WHERE id=? AND organization_id=?").get(data.profileId, organizationId);
    if (!profile) return { error: "Perfil inválido." };
    return { profileId: profile.id, role: profile.base_role };
  }
  // Sem profileId: usa o role legado e vincula ao perfil-semente correspondente, se existir.
  const role = data.role || "EMPLOYEE";
  const slug = { ADMIN: "administrador", TECHNICIAN: "tecnico", EMPLOYEE: "usuario" }[role];
  const profile = db.prepare("SELECT id FROM profiles WHERE organization_id=? AND slug=?").get(organizationId, slug);
  return { profileId: profile?.id || null, role };
}

export function listUsers(db, organizationId, branchIds = null) {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.profile_id, u.branch_id, u.asset_id, u.active,
      u.password_reset_required, u.auth_provider, u.created_at, b.name branch_name, a.hostname,
      p.name profile_name
    FROM users u
    LEFT JOIN branches b ON b.id=u.branch_id
    LEFT JOIN assets a ON a.id=u.asset_id
    LEFT JOIN profiles p ON p.id=u.profile_id
    WHERE u.organization_id=?
    ORDER BY u.active DESC, u.name
  `).all(organizationId);
  const links = db.prepare(`
    SELECT ub.user_id, ub.branch_id, ub.is_primary, b.name branch_name
    FROM user_branches ub JOIN branches b ON b.id=ub.branch_id
    WHERE b.organization_id=? ORDER BY ub.is_primary DESC, b.name
  `).all(organizationId);
  return users.map((user) => ({
    ...user,
    active: Boolean(user.active),
    passwordResetRequired: Boolean(user.password_reset_required),
    authProvider: user.auth_provider || "LOCAL",
    profileId: user.profile_id || null,
    profileName: user.profile_name || roleLabel(user.role),
    roleLabel: user.profile_name || roleLabel(user.role),
    branches: links.filter((link) => link.user_id === user.id).map((link) => ({
      id: link.branch_id, name: link.branch_name, primary: Boolean(link.is_primary),
    })),
    branchIds: links.filter((link) => link.user_id === user.id).map((link) => link.branch_id),
  })).filter((user) => {
    if (!branchIds?.length) return true;
    return user.branchIds.some((id) => branchIds.includes(id));
  });
}

function validateBranches(db, organizationId, branchIds, primaryBranchId, assetId) {
  if (!branchIds.includes(primaryBranchId)) return "A unidade principal deve estar entre as unidades vinculadas.";
  const count = db.prepare(`SELECT COUNT(*) total FROM branches WHERE organization_id=? AND id IN (${branchIds.map(() => "?").join(",")})`).get(organizationId, ...branchIds).total;
  if (count !== branchIds.length) return "Uma ou mais unidades são inválidas.";
  if (assetId) {
    const asset = db.prepare("SELECT branch_id FROM assets WHERE id=? AND organization_id=?").get(assetId, organizationId);
    if (!asset || !branchIds.includes(asset.branch_id)) return "O equipamento deve pertencer a uma unidade vinculada.";
  }
  return null;
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const permissions = getPermissions(currentUser);
  if (!permissions.canConfigure && !permissions.canManageTickets) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const db = getDb();
  const branchIds = permissions.canViewAllBranches
    ? null
    : getAllowedBranchIds(currentUser, db);
  return Response.json({ users: listUsers(db, currentUser.organization_id, branchIds) });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!can(currentUser, "users", "create")) return Response.json({ error: "Sem permissão para criar usuários." }, { status: 403 });
  const parsed = userSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Revise os dados do usuário." }, { status: 400 });
  const db = getDb();
  const branchError = validateBranches(db, currentUser.organization_id, parsed.data.branchIds, parsed.data.primaryBranchId, parsed.data.assetId);
  if (branchError) return Response.json({ error: branchError }, { status: 400 });
  if (db.prepare("SELECT id FROM users WHERE organization_id=? AND email=?").get(currentUser.organization_id, parsed.data.email.toLowerCase())) return Response.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 });
  const resolved = resolveProfile(db, currentUser.organization_id, parsed.data);
  if (resolved.error) return Response.json({ error: resolved.error }, { status: 400 });
  // Impede escalonamento: não-admin não pode criar usuário de patente igual ou maior à sua.
  if (!canManageUser(currentUser, resolved.role)) return Response.json({ error: "Você não pode criar um usuário de igual ou maior privilégio." }, { status: 403 });
  const id = makeId("usr");
  const authProvider = parsed.data.authProvider || "LOCAL";
  const create = db.transaction(() => {
    db.prepare(`INSERT INTO users
      (id, organization_id, branch_id, name, email, role, profile_id, created_at, asset_id, active, password_hash, password_reset_required, auth_provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
      .run(id, currentUser.organization_id, parsed.data.primaryBranchId, parsed.data.name, parsed.data.email.toLowerCase(), resolved.role, resolved.profileId, new Date().toISOString(), parsed.data.assetId || null, authProvider === "LOCAL" ? bcrypt.hashSync("Nexus@123", 12) : null, authProvider === "LOCAL" ? 1 : 0, authProvider);
    const insertBranch = db.prepare("INSERT INTO user_branches (user_id, branch_id, is_primary) VALUES (?, ?, ?)");
    parsed.data.branchIds.forEach((branchId) => insertBranch.run(id, branchId, branchId === parsed.data.primaryBranchId ? 1 : 0));
  });
  create();
  return Response.json({ userId: id, temporaryPassword: "Nexus@123", users: listUsers(db, currentUser.organization_id) }, { status: 201 });
}

export { userSchema, validateBranches, resolveProfile };
