import { can, getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  // Localizações alimentam telas operacionais (formulário de ativo). Libera quem gere
  // localizações OU ativos; bloqueia o portal do colaborador (sem nenhum dos dois).
  if (!can(auth.user, "locations", "read") && !can(auth.user, "assets", "read")) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }
  const db = getDb();
  const branchId = new URL(request.url).searchParams.get("branchId");
  const permissions = getPermissions(auth.user);
  const branchIds = permissions.canViewAllBranches
    ? db.prepare("SELECT id FROM branches WHERE organization_id=?").all(auth.user.organization_id).map((b) => b.id)
    : auth.user.branchIds;

  let locations;
  if (branchId && branchIds.includes(branchId)) {
    locations = db.prepare(`
      SELECT l.id, l.name, l.code, l.branch_id, b.name AS branch_name
      FROM locations l JOIN branches b ON b.id=l.branch_id
      WHERE l.organization_id=? AND l.branch_id=? AND l.active=1
      ORDER BY l.name
    `).all(auth.user.organization_id, branchId);
  } else if (branchIds.length) {
    const placeholders = branchIds.map(() => "?").join(",");
    locations = db.prepare(`
      SELECT l.id, l.name, l.code, l.branch_id, b.name AS branch_name
      FROM locations l JOIN branches b ON b.id=l.branch_id
      WHERE l.organization_id=? AND l.branch_id IN (${placeholders}) AND l.active=1
      ORDER BY b.name, l.name
    `).all(auth.user.organization_id, ...branchIds);
  } else {
    locations = [];
  }
  return Response.json({ locations });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "locations", "create")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const body = await request.json();
  const name = String(body.name || "").trim();
  const branchId = String(body.branchId || "").trim();
  if (name.length < 2 || !branchId) {
    return Response.json({ error: "Nome e unidade são obrigatórios." }, { status: 400 });
  }
  const db = getDb();
  const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(branchId, auth.user.organization_id);
  if (!branch) return Response.json({ error: "Unidade inválida." }, { status: 400 });

  const { makeId } = await import("@/lib/db");
  const now = new Date().toISOString();
  const id = makeId("loc");
  db.prepare(`
    INSERT INTO locations (id, organization_id, branch_id, name, code, active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(id, auth.user.organization_id, branchId, name, body.code?.trim() || null, now);
  return Response.json({ id }, { status: 201 });
}
