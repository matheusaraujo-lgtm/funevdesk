import { requireCurrentUser, roleLabel, getPermissions, can, canManageUser } from "@/lib/auth";
import { getAllowedBranchIds } from "@/lib/branch-scope";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// Senha padrão temporária de novos usuários LOCAL. Troca obrigatória no 1º login
// (password_reset_required=1). Mostrada uma vez ao admin que criou o usuário.
const DEFAULT_USER_PASSWORD = "funev@2026";

// Aceita um e-mail completo (fulano@empresa.com) OU um login no formato "nome.ultimonome"
// (usado quando o AD/login interno não usa e-mail). O login sem @ precisa ter ao menos um
// ponto separando as partes e só letras/números/._- (ex.: joao.silva, ana.paula.souza).
const USERNAME_RE = /^[a-z0-9]+([._-][a-z0-9]+)+$/i;
function normalizeLogin(value) {
  return String(value || "").trim().toLowerCase();
}
function isValidLogin(value) {
  const v = normalizeLogin(value);
  if (!v || v.length > 180) return false;
  if (z.string().email().safeParse(v).success) return true;
  return USERNAME_RE.test(v);
}
const loginField = z.string().min(3).max(180).refine(isValidLogin, {
  message: "Informe um e-mail válido ou um login no formato nome.ultimonome.",
});

const userSchema = z.object({
  name: z.string().min(3).max(120),
  email: loginField,
  role: z.enum(["ADMIN", "TECHNICIAN", "EMPLOYEE"]).optional(),
  profileId: z.string().min(1).optional(),
  branchIds: z.array(z.string().min(1)).min(1),
  primaryBranchId: z.string().min(1),
  allBranches: z.boolean().optional().default(false),
  assetId: z.string().nullable().optional(),
  authProvider: z.enum(["LOCAL", "LDAP"]).optional().default("LOCAL"),
});

// Import por planilha (mesmo contrato de rede/ativos): cada linha traz nome, login/e-mail,
// perfil (por nome do papel) e unidade (por nome OU código). Unidade vira principal + única.
const importRowSchema = z.object({
  name: z.string().min(3).max(120),
  email: z.string().min(3).max(180).refine(isValidLogin, { message: "Login inválido." }),
  role: z.string().optional().default("EMPLOYEE"),
  branch: z.string().min(1),
  allBranches: z.string().optional().default(""),
});
const importSchema = z.object({ rows: z.array(importRowSchema).min(1).max(500) });

// "Administrador"/"admin" -> ADMIN, "Técnico"/"tecnico" -> TECHNICIAN, resto -> EMPLOYEE.
function normalizeRole(value) {
  const v = String(value || "").trim().toLowerCase();
  if (["admin", "administrador", "administrator"].includes(v)) return "ADMIN";
  if (["tecnico", "técnico", "technician", "tec"].includes(v)) return "TECHNICIAN";
  return "EMPLOYEE";
}
function truthy(value) {
  return ["1", "sim", "true", "yes", "s", "todas"].includes(String(value || "").trim().toLowerCase());
}

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
      u.password_reset_required, u.auth_provider, u.all_branches, u.created_at, b.name branch_name, a.hostname,
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
    allBranches: Boolean(user.all_branches),
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

// Isolamento na ESCRITA: um ator restrito a unidades não pode criar/mover usuários para
// unidades fora do seu escopo, nem conceder "todas as unidades" sendo ele próprio restrito.
function actorBranchScopeError(actor, data, existingAllBranches = false) {
  // Conceder acesso a TODAS as unidades exige ser um administrador com acesso total.
  // Não basta ter all_branches (ex.: técnico all_branches com permissão de usuários não pode).
  // Só bloqueia CONCESSÃO nova — editar um usuário que já tinha o acesso não reconcede.
  const grantingAll = data.allBranches && !existingAllBranches;
  if (grantingAll && !(actor.all_branches && actor.role === "ADMIN")) {
    return "Apenas um administrador com acesso a todas as unidades pode conceder esse acesso.";
  }
  if (actor.all_branches) return null;
  const outside = data.branchIds.filter((branchId) => !actor.branchIds.includes(branchId));
  if (outside.length) return "Você só pode atribuir unidades às quais você tem acesso.";
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

  if (new URL(request.url).searchParams.get("mode") === "template") {
    const branches = db.prepare("SELECT id, name, code FROM branches WHERE organization_id=? ORDER BY name").all(currentUser.organization_id);
    return Response.json({
      columns: ["name", "email", "role", "branch", "allBranches"],
      example: {
        name: "Maria Souza",
        email: "maria.souza",
        role: "Usuário",
        branch: branches[0]?.code || branches[0]?.name || "MATRIZ",
        allBranches: "nao",
      },
      branches,
    });
  }

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
  const body = await request.json();

  // Importação por planilha: cria vários usuários de uma vez (ignora e-mails já existentes).
  if (body?.rows) {
    return importUsers(currentUser, body);
  }

  const parsed = userSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Revise os dados do usuário." }, { status: 400 });
  const db = getDb();
  const branchError = validateBranches(db, currentUser.organization_id, parsed.data.branchIds, parsed.data.primaryBranchId, parsed.data.assetId);
  if (branchError) return Response.json({ error: branchError }, { status: 400 });
  const scopeError = actorBranchScopeError(currentUser, parsed.data);
  if (scopeError) return Response.json({ error: scopeError }, { status: 403 });
  if (db.prepare("SELECT id FROM users WHERE organization_id=? AND email=?").get(currentUser.organization_id, parsed.data.email.toLowerCase())) return Response.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 });
  const resolved = resolveProfile(db, currentUser.organization_id, parsed.data);
  if (resolved.error) return Response.json({ error: resolved.error }, { status: 400 });
  // Impede escalonamento: não-admin não pode criar usuário de patente igual ou maior à sua.
  if (!canManageUser(currentUser, resolved.role)) return Response.json({ error: "Você não pode criar um usuário de igual ou maior privilégio." }, { status: 403 });
  const id = makeId("usr");
  const authProvider = parsed.data.authProvider || "LOCAL";
  const create = db.transaction(() => {
    db.prepare(`INSERT INTO users
      (id, organization_id, branch_id, name, email, role, profile_id, created_at, asset_id, active, password_hash, password_reset_required, auth_provider, all_branches)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
      .run(id, currentUser.organization_id, parsed.data.primaryBranchId, parsed.data.name, parsed.data.email.toLowerCase(), resolved.role, resolved.profileId, new Date().toISOString(), parsed.data.assetId || null, authProvider === "LOCAL" ? bcrypt.hashSync(DEFAULT_USER_PASSWORD, 12) : null, authProvider === "LOCAL" ? 1 : 0, authProvider, parsed.data.allBranches ? 1 : 0);
    const insertBranch = db.prepare("INSERT INTO user_branches (user_id, branch_id, is_primary) VALUES (?, ?, ?)");
    parsed.data.branchIds.forEach((branchId) => insertBranch.run(id, branchId, branchId === parsed.data.primaryBranchId ? 1 : 0));
  });
  create();
  return Response.json({ userId: id, temporaryPassword: DEFAULT_USER_PASSWORD, users: listUsers(db, currentUser.organization_id) }, { status: 201 });
}

// Importação em lote. Só admin. Resolve unidade por código OU nome, cria com senha padrão
// (troca no 1º login) e IGNORA e-mails/logins que já existem (conta em "skipped").
function importUsers(currentUser, body) {
  if (!getPermissions(currentUser).canConfigure) return Response.json({ error: "Apenas administradores podem importar usuários." }, { status: 403 });
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Planilha inválida. Confira as colunas do modelo." }, { status: 400 });
  const db = getDb();
  const org = currentUser.organization_id;

  const branchRows = db.prepare("SELECT id, name, code FROM branches WHERE organization_id=?").all(org);
  const branchByKey = new Map();
  for (const branch of branchRows) {
    branchByKey.set(String(branch.code || "").trim().toLowerCase(), branch.id);
    branchByKey.set(String(branch.name || "").trim().toLowerCase(), branch.id);
  }
  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;

  const run = db.transaction(() => {
    const findEmail = db.prepare("SELECT id FROM users WHERE organization_id=? AND email=?");
    const insertUser = db.prepare(`INSERT INTO users
      (id, organization_id, branch_id, name, email, role, profile_id, created_at, asset_id, active, password_hash, password_reset_required, auth_provider, all_branches)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, 1, 'LOCAL', ?)`);
    const insertBranch = db.prepare("INSERT INTO user_branches (user_id, branch_id, is_primary) VALUES (?, ?, 1)");
    const defaultHash = bcrypt.hashSync(DEFAULT_USER_PASSWORD, 12);

    for (const row of parsed.data.rows) {
      const branchId = branchByKey.get(String(row.branch).trim().toLowerCase());
      if (!branchId) throw new Error(`Unidade "${row.branch}" não encontrada (use o nome ou o código da unidade).`);
      // Isolamento: importador restrito só cria em unidades do seu escopo e não concede "todas".
      const wantsAll = truthy(row.allBranches);
      if (wantsAll && !(currentUser.all_branches && currentUser.role === "ADMIN")) {
        throw new Error("Apenas um administrador com acesso a todas as unidades pode conceder esse acesso.");
      }
      if (!currentUser.all_branches && !currentUser.branchIds.includes(branchId)) {
        throw new Error(`Você não pode importar para a unidade "${row.branch}".`);
      }
      const email = normalizeLogin(row.email);
      if (findEmail.get(org, email)) { skipped += 1; continue; }
      const role = normalizeRole(row.role);
      // Import não pode criar usuário de privilégio igual/maior que o do importador.
      if (!canManageUser(currentUser, role)) throw new Error(`Sem permissão para criar "${row.name}" com o perfil informado.`);
      const resolved = resolveProfile(db, org, { role });
      const id = makeId("usr");
      insertUser.run(id, org, branchId, row.name, email, resolved.role, resolved.profileId, now, defaultHash, wantsAll ? 1 : 0);
      insertBranch.run(id, branchId);
      imported += 1;
    }
  });

  try {
    run();
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  return Response.json({ imported, skipped, temporaryPassword: DEFAULT_USER_PASSWORD, users: listUsers(db, org) });
}

export { userSchema, validateBranches, resolveProfile, actorBranchScopeError };
