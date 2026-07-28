import { can, getPermissions, requireCurrentUser } from "@/lib/auth";
import { canAccessBranch } from "@/lib/branch-scope";
import { getDb, makeId } from "@/lib/db";

export const dynamic = "force-dynamic";

// Importação em lote de localizações. Regras: nome obrigatório; unidade aceita ID, NOME ou
// CÓDIGO da unidade; upsert por (organização, unidade, nome) — reimportar atualiza o código.
function importLocationRows(db, organizationId, rows, user) {
  // Resolve a unidade por ID, nome ou código (tudo normalizado em minúsculas/trim).
  const branchRows = db.prepare("SELECT id, name, code FROM branches WHERE organization_id=?").all(organizationId);
  const branchByKey = new Map();
  for (const b of branchRows) {
    branchByKey.set(b.id, b.id);
    branchByKey.set(String(b.name || "").trim().toLowerCase(), b.id);
    if (b.code) branchByKey.set(String(b.code).trim().toLowerCase(), b.id);
  }
  const resolveBranch = (raw) => {
    const value = String(raw || "").trim();
    return branchByKey.get(value) || branchByKey.get(value.toLowerCase()) || null;
  };
  const now = new Date().toISOString();
  let imported = 0;
  const run = db.transaction(() => {
    const find = db.prepare("SELECT id FROM locations WHERE organization_id=? AND branch_id=? AND name=? LIMIT 1");
    const insert = db.prepare("INSERT INTO locations (id, organization_id, branch_id, name, code, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)");
    const update = db.prepare("UPDATE locations SET code=?, active=1 WHERE id=?");
    rows.forEach((row, index) => {
      const name = String(row.name || "").trim();
      // Aceita "branchId", "branch" ou "unidade" como cabeçalho da coluna.
      const branchId = resolveBranch(row.branchId ?? row.branch ?? row.unidade);
      if (!name) throw new Error(`Linha ${index + 2}: o nome da localização é obrigatório.`);
      if (!branchId) throw new Error(`Linha ${index + 2}: unidade "${String(row.branchId ?? row.branch ?? row.unidade ?? "").trim()}" não encontrada (use o nome, o código ou o ID da unidade) para "${name}".`);
      if (!canAccessBranch(user, branchId)) throw new Error("Uma ou mais unidades estão fora do seu acesso.");
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
  // Localizações alimentam telas operacionais (formulário de ativo) E o campo "Localização"
  // ao abrir chamado. Libera quem gere localizações, ativos OU pode abrir chamado — sempre
  // com escopo por unidade (a query abaixo restringe às unidades do próprio usuário).
  if (!can(auth.user, "locations", "read") && !can(auth.user, "assets", "read") && !can(auth.user, "tickets", "create")) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }
  const db = getDb();
  const url = new URL(request.url);

  // O modelo de importação é só para quem gerencia localizações.
  if (url.searchParams.get("mode") === "template" && !can(auth.user, "locations", "read")) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }

  if (url.searchParams.get("mode") === "template") {
    const branches = db.prepare("SELECT id, name FROM branches WHERE organization_id=? ORDER BY name").all(auth.user.organization_id);
    const unidade = branches[0]?.name || "Nome da unidade";
    return Response.json({
      // "name" = nome da localização · "unidade" = nome/código/ID da unidade · "code" = sigla opcional.
      columns: ["name", "unidade", "code"],
      examples: [
        { name: "Recepção", unidade, code: "REC" },
        { name: "Sala de Medicação", unidade, code: "MED" },
        { name: "Triagem", unidade, code: "TRI" },
      ],
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
      const imported = importLocationRows(db, auth.user.organization_id, body.rows, auth.user);
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
  if (!canAccessBranch(auth.user, branchId)) return Response.json({ error: "Acesso negado." }, { status: 403 });
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
