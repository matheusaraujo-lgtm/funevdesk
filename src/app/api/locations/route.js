import { can, getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";

export const dynamic = "force-dynamic";

// Importação em lote de localizações. Regras: nome obrigatório; unidade (branchId) válida;
// upsert por (organização, unidade, nome) — reimportar atualiza o código.
function importLocationRows(db, organizationId, rows) {
  const validBranches = new Set(db.prepare("SELECT id FROM branches WHERE organization_id=?").all(organizationId).map((b) => b.id));
  const now = new Date().toISOString();
  let imported = 0;
  const run = db.transaction(() => {
    const find = db.prepare("SELECT id FROM locations WHERE organization_id=? AND branch_id=? AND name=? LIMIT 1");
    const insert = db.prepare("INSERT INTO locations (id, organization_id, branch_id, name, code, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)");
    const update = db.prepare("UPDATE locations SET code=?, active=1 WHERE id=?");
    rows.forEach((row, index) => {
      const name = String(row.name || "").trim();
      const branchId = String(row.branchId || "").trim();
      if (!name) throw new Error(`Linha ${index + 2}: o nome da localização é obrigatório.`);
      if (!validBranches.has(branchId)) throw new Error(`Linha ${index + 2}: unidade (branchId) inválida para "${name}".`);
      const code = String(row.code || "").trim() || null;
      const existing = find.get(organizationId, branchId, name);
      if (existing) update.run(code, existing.id);
      else insert.run(makeId("loc"), organizationId, branchId, name, code, now);
      imported += 1;
    });
  });
  run();
  return imported;
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  // Localizações alimentam telas operacionais (formulário de ativo). Libera quem gere
  // localizações OU ativos; bloqueia o portal do colaborador (sem nenhum dos dois).
  if (!can(auth.user, "locations", "read") && !can(auth.user, "assets", "read")) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }
  const db = getDb();
  const url = new URL(request.url);

  if (url.searchParams.get("mode") === "template") {
    const branches = db.prepare("SELECT id, name FROM branches WHERE organization_id=? ORDER BY name").all(auth.user.organization_id);
    return Response.json({
      columns: ["name", "branchId", "code"],
      example: { name: "Sala 101", branchId: branches[0]?.id || "ID_DA_UNIDADE", code: "S101" },
      branches,
    });
  }

  const branchId = url.searchParams.get("branchId");
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

  // Importação por planilha.
  if (Array.isArray(body?.rows)) {
    if (!body.rows.length) return Response.json({ error: "Planilha vazia." }, { status: 400 });
    const db = getDb();
    try {
      const imported = importLocationRows(db, auth.user.organization_id, body.rows);
      return Response.json({ imported });
    } catch (error) {
      return Response.json({ error: error.message || "Não foi possível importar." }, { status: 400 });
    }
  }

  const name = String(body.name || "").trim();
  const branchId = String(body.branchId || "").trim();
  if (name.length < 2 || !branchId) {
    return Response.json({ error: "Nome e unidade são obrigatórios." }, { status: 400 });
  }
  const db = getDb();
  const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(branchId, auth.user.organization_id);
  if (!branch) return Response.json({ error: "Unidade inválida." }, { status: 400 });

  const now = new Date().toISOString();
  const id = makeId("loc");
  db.prepare(`
    INSERT INTO locations (id, organization_id, branch_id, name, code, active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(id, auth.user.organization_id, branchId, name, body.code?.trim() || null, now);
  return Response.json({ id }, { status: 201 });
}
