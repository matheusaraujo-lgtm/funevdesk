import { requireCurrentUser, can } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { getAllowedBranchIds } from "@/lib/branch-scope";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(120),
  branchId: z.string().nullable().optional(),
  description: z.string().max(500).optional().default(""),
  memberIds: z.array(z.string()).default([]),
});

// Valida que branchId e memberIds pertencem à organização do solicitante — impede
// vincular unidades/usuários de OUTRA empresa a uma equipe (vazamento cross-tenant).
export function validateTeamRefs(db, organizationId, branchId, memberIds) {
  if (branchId) {
    const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(branchId, organizationId);
    if (!branch) return "Unidade inválida.";
  }
  if (memberIds && memberIds.length) {
    const placeholders = memberIds.map(() => "?").join(",");
    const count = db.prepare(`SELECT COUNT(*) n FROM users WHERE organization_id=? AND id IN (${placeholders})`).get(organizationId, ...memberIds).n;
    if (count !== memberIds.length) return "Um ou mais usuários são inválidos.";
  }
  return null;
}

export function listTeams(db, organizationId) {
  const teams = db.prepare("SELECT t.*, b.name branch_name FROM teams t LEFT JOIN branches b ON b.id=t.branch_id WHERE t.organization_id=? ORDER BY t.name").all(organizationId);
  const members = db.prepare(`
    SELECT tm.team_id, u.id user_id, u.name user_name
    FROM team_members tm JOIN users u ON u.id=tm.user_id
    JOIN teams t ON t.id=tm.team_id WHERE t.organization_id=?
  `).all(organizationId);
  return teams.map((team) => ({
    ...team,
    members: members.filter((m) => m.team_id === team.id).map((m) => ({ id: m.user_id, name: m.user_name })),
    memberIds: members.filter((m) => m.team_id === team.id).map((m) => m.user_id),
  }));
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "teams", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const requestedBranchId = new URL(request.url).searchParams.get("branchId");
  const scopedBranchIds = getAllowedBranchIds(auth.user, db, requestedBranchId || null);
  let teams = listTeams(db, auth.user.organization_id);
  if (auth.user.role !== "ADMIN") {
    teams = teams.filter((team) => !team.branch_id || scopedBranchIds.includes(team.branch_id));
  } else if (requestedBranchId) {
    teams = teams.filter((team) => !team.branch_id || team.branch_id === requestedBranchId);
  }
  return Response.json({ teams });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "ADMIN") return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const refError = validateTeamRefs(db, auth.user.organization_id, parsed.data.branchId, parsed.data.memberIds);
  if (refError) return Response.json({ error: refError }, { status: 400 });
  const id = makeId("team");
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("INSERT INTO teams (id, organization_id, branch_id, name, description, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, auth.user.organization_id, parsed.data.branchId || null, parsed.data.name, parsed.data.description || "", now);
    const insert = db.prepare("INSERT INTO team_members (team_id, user_id) VALUES (?, ?)");
    parsed.data.memberIds.forEach((userId) => insert.run(id, userId));
  })();
  return Response.json({ teams: listTeams(db, auth.user.organization_id) }, { status: 201 });
}
