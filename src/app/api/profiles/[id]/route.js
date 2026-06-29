import { requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { MODULES, sanitizeMatrix } from "@/lib/permissions";
import { listProfiles, profileSchema } from "@/app/api/profiles/route";

export const dynamic = "force-dynamic";

function findProfile(db, id, organizationId) {
  return db.prepare("SELECT * FROM profiles WHERE id=? AND organization_id=?").get(id, organizationId);
}

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requirePermission(request, "profiles", "read");
  if (auth.error) return auth.error;
  const db = getDb();
  if (!findProfile(db, id, auth.user.organization_id)) return Response.json({ error: "Perfil não encontrado." }, { status: 404 });
  const profile = listProfiles(db, auth.user.organization_id).find((item) => item.id === id);
  return Response.json({ profile, modules: MODULES });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const auth = requirePermission(request, "profiles", "update");
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Revise os dados do perfil." }, { status: 400 });
  const db = getDb();
  const profile = findProfile(db, id, currentUser.organization_id);
  if (!profile) return Response.json({ error: "Perfil não encontrado." }, { status: 404 });

  const matrix = sanitizeMatrix(parsed.data.permissions);
  // Perfis de sistema mantêm o base_role e o nome originais (evita lockout/confusão); só a matriz é editável.
  const baseRole = profile.is_system ? profile.base_role : parsed.data.baseRole;
  const name = profile.is_system ? profile.name : parsed.data.name;
  const save = db.transaction(() => {
    db.prepare("UPDATE profiles SET name=?, description=?, base_role=? WHERE id=?")
      .run(name, parsed.data.description || null, baseRole, id);
    const upsert = db.prepare(`INSERT INTO profile_permissions (profile_id, module, can_read, can_create, can_update, can_delete)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, module) DO UPDATE SET can_read=excluded.can_read, can_create=excluded.can_create, can_update=excluded.can_update, can_delete=excluded.can_delete`);
    for (const mod of MODULES) {
      const perm = matrix[mod.key];
      upsert.run(id, mod.key, perm.read ? 1 : 0, perm.create ? 1 : 0, perm.update ? 1 : 0, perm.delete ? 1 : 0);
    }
  });
  save();
  logAudit(db, {
    organizationId: currentUser.organization_id, actorId: currentUser.id, actorName: currentUser.name,
    entityType: "PROFILE", entityId: id, action: "UPDATE", details: { name },
  });
  return Response.json({ profiles: listProfiles(db, currentUser.organization_id) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requirePermission(request, "profiles", "delete");
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const db = getDb();
  const profile = findProfile(db, id, currentUser.organization_id);
  if (!profile) return Response.json({ error: "Perfil não encontrado." }, { status: 404 });
  if (profile.is_system) return Response.json({ error: "Perfis de sistema não podem ser excluídos." }, { status: 409 });
  const inUse = db.prepare("SELECT COUNT(*) total FROM users WHERE profile_id=?").get(id).total;
  if (inUse) return Response.json({ error: "Há usuários vinculados a este perfil. Reatribua-os antes de excluir." }, { status: 409 });
  db.prepare("DELETE FROM profiles WHERE id=?").run(id);
  logAudit(db, {
    organizationId: currentUser.organization_id, actorId: currentUser.id, actorName: currentUser.name,
    entityType: "PROFILE", entityId: id, action: "DELETE", details: { name: profile.name },
  });
  return Response.json({ profiles: listProfiles(db, currentUser.organization_id) });
}
