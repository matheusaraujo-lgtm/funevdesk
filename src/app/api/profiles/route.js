import { requireCurrentUser, requirePermission } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { MODULES, sanitizeMatrix } from "@/lib/permissions";
import { z } from "zod";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(280).optional().default(""),
  baseRole: z.enum(["ADMIN", "TECHNICIAN", "EMPLOYEE"]),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional().default({}),
});

function slugify(value) {
  return value.toString().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "perfil";
}

// Monta a lista de perfis com sua matriz de permissões.
export function listProfiles(db, organizationId) {
  const profiles = db.prepare(`
    SELECT p.id, p.name, p.slug, p.description, p.base_role, p.is_system, p.created_at,
      (SELECT COUNT(*) FROM users u WHERE u.profile_id = p.id AND u.organization_id = p.organization_id) AS user_count
    FROM profiles p WHERE p.organization_id=? ORDER BY p.is_system DESC, p.name
  `).all(organizationId);
  const perms = db.prepare(`
    SELECT pp.profile_id, pp.module, pp.can_read, pp.can_create, pp.can_update, pp.can_delete
    FROM profile_permissions pp JOIN profiles p ON p.id=pp.profile_id WHERE p.organization_id=?
  `).all(organizationId);
  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    slug: profile.slug,
    description: profile.description || "",
    baseRole: profile.base_role,
    isSystem: Boolean(profile.is_system),
    userCount: Number(profile.user_count) || 0,
    createdAt: profile.created_at,
    permissions: perms.filter((row) => row.profile_id === profile.id).reduce((acc, row) => {
      acc[row.module] = {
        read: Boolean(row.can_read), create: Boolean(row.can_create),
        update: Boolean(row.can_update), delete: Boolean(row.can_delete),
      };
      return acc;
    }, {}),
  }));
}

export async function GET(request) {
  const auth = requirePermission(request, "profiles", "read");
  if (auth.error) return auth.error;
  const db = getDb();
  return Response.json({ profiles: listProfiles(db, auth.user.organization_id), modules: MODULES });
}

export async function POST(request) {
  const auth = requirePermission(request, "profiles", "create");
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Revise os dados do perfil." }, { status: 400 });
  const db = getDb();

  let slug = slugify(parsed.data.name);
  if (db.prepare("SELECT id FROM profiles WHERE organization_id=? AND slug=?").get(currentUser.organization_id, slug)) {
    slug = `${slug}-${makeId("p").slice(-4)}`;
  }
  const id = makeId("prf");
  const matrix = sanitizeMatrix(parsed.data.permissions);
  const create = db.transaction(() => {
    db.prepare("INSERT INTO profiles (id, organization_id, name, slug, description, base_role, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)")
      .run(id, currentUser.organization_id, parsed.data.name, slug, parsed.data.description || null, parsed.data.baseRole, new Date().toISOString());
    const insert = db.prepare("INSERT INTO profile_permissions (profile_id, module, can_read, can_create, can_update, can_delete) VALUES (?, ?, ?, ?, ?, ?)");
    for (const mod of MODULES) {
      const perm = matrix[mod.key];
      insert.run(id, mod.key, perm.read ? 1 : 0, perm.create ? 1 : 0, perm.update ? 1 : 0, perm.delete ? 1 : 0);
    }
  });
  create();
  logAudit(db, {
    organizationId: currentUser.organization_id, actorId: currentUser.id, actorName: currentUser.name,
    entityType: "PROFILE", entityId: id, action: "CREATE", details: { name: parsed.data.name },
  });
  return Response.json({ profileId: id, profiles: listProfiles(db, currentUser.organization_id) }, { status: 201 });
}

export { profileSchema };
