import { requireCurrentUser, can, canManageUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listUsers, userSchema, validateBranches, resolveProfile } from "@/app/api/users/route";

export async function PUT(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!can(currentUser, "users", "update")) return Response.json({ error: "Sem permissão para editar usuários." }, { status: 403 });
  const body = await request.json();
  const parsed = userSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Revise os dados do usuário." }, { status: 400 });
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id=? AND organization_id=?").get(id, currentUser.organization_id);
  if (!user) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (!canManageUser(currentUser, user.role)) return Response.json({ error: "Você não pode gerenciar um usuário de igual ou maior privilégio." }, { status: 403 });
  const duplicate = db.prepare("SELECT id FROM users WHERE organization_id=? AND email=? AND id<>?").get(currentUser.organization_id, parsed.data.email.toLowerCase(), id);
  if (duplicate) return Response.json({ error: "Já existe outro usuário com este e-mail." }, { status: 409 });
  const branchError = validateBranches(db, currentUser.organization_id, parsed.data.branchIds, parsed.data.primaryBranchId, parsed.data.assetId);
  if (branchError) return Response.json({ error: branchError }, { status: 400 });
  const resolved = resolveProfile(db, currentUser.organization_id, parsed.data);
  if (resolved.error) return Response.json({ error: resolved.error }, { status: 400 });
  // Impede escalonamento: não-admin não pode promover ninguém a uma patente >= à sua.
  if (!canManageUser(currentUser, resolved.role)) return Response.json({ error: "Você não pode atribuir um perfil de igual ou maior privilégio." }, { status: 403 });
  const authProvider = parsed.data.authProvider || "LOCAL";
  const save = db.transaction(() => {
    db.prepare("UPDATE users SET name=?, email=?, role=?, profile_id=?, branch_id=?, asset_id=?, auth_provider=? WHERE id=?")
      .run(parsed.data.name, parsed.data.email.toLowerCase(), resolved.role, resolved.profileId, parsed.data.primaryBranchId, parsed.data.assetId || null, authProvider, id);
    db.prepare("DELETE FROM user_branches WHERE user_id=?").run(id);
    const insertBranch = db.prepare("INSERT INTO user_branches (user_id, branch_id, is_primary) VALUES (?, ?, ?)");
    parsed.data.branchIds.forEach((branchId) => insertBranch.run(id, branchId, branchId === parsed.data.primaryBranchId ? 1 : 0));
  });
  save();
  return Response.json({ users: listUsers(db, currentUser.organization_id) });
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!can(currentUser, "users", "update")) return Response.json({ error: "Sem permissão para alterar usuários." }, { status: 403 });
  const { active } = await request.json();
  if (typeof active !== "boolean") return Response.json({ error: "Situação inválida." }, { status: 400 });
  if (id === currentUser.id && !active) return Response.json({ error: "Você não pode desativar seu próprio usuário." }, { status: 409 });
  const db = getDb();
  const target = db.prepare("SELECT role FROM users WHERE id=? AND organization_id=?").get(id, currentUser.organization_id);
  if (!target) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (!canManageUser(currentUser, target.role)) return Response.json({ error: "Você não pode gerenciar um usuário de igual ou maior privilégio." }, { status: 403 });
  const result = db.prepare("UPDATE users SET active=? WHERE id=? AND organization_id=?").run(active ? 1 : 0, id, currentUser.organization_id);
  if (!result.changes) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
  return Response.json({ users: listUsers(db, currentUser.organization_id) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!can(currentUser, "users", "delete")) return Response.json({ error: "Sem permissão para excluir usuários." }, { status: 403 });
  if (id === currentUser.id) return Response.json({ error: "Você não pode excluir seu próprio usuário." }, { status: 409 });
  const db = getDb();
  const user = db.prepare("SELECT id, role FROM users WHERE id=? AND organization_id=?").get(id, currentUser.organization_id);
  if (!user) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (!canManageUser(currentUser, user.role)) return Response.json({ error: "Você não pode excluir um usuário de igual ou maior privilégio." }, { status: 403 });
  const tickets = db.prepare("SELECT COUNT(*) total FROM tickets WHERE requester_id=?").get(id).total;
  const events = db.prepare("SELECT COUNT(*) total FROM ticket_events WHERE actor_id=?").get(id).total;
  if (tickets || events) return Response.json({ error: "Este usuário possui histórico. Desative-o em vez de excluir." }, { status: 409 });
  db.prepare("DELETE FROM users WHERE id=?").run(id);
  return Response.json({ users: listUsers(db, currentUser.organization_id) });
}
