import { requireCurrentUser, can } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getAllowedBranchIds } from "@/lib/branch-scope";
import { listTeams, validateTeamRefs } from "../route";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "teams", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  const team = listTeams(db, auth.user.organization_id).find((t) => t.id === id);
  if (!team) return Response.json({ error: "Equipe não encontrada." }, { status: 404 });
  if (auth.user.role !== "ADMIN") {
    const scopedBranchIds = getAllowedBranchIds(auth.user, db);
    if (team.branch_id && !scopedBranchIds.includes(team.branch_id)) {
      return Response.json({ error: "Equipe não encontrada." }, { status: 404 });
    }
  }
  return Response.json({ team });
}

const schema = z.object({
  name: z.string().min(2).max(120).optional(),
  branchId: z.string().nullable().optional(),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string()).optional(),
});

export async function PUT(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "ADMIN") return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const team = db.prepare("SELECT * FROM teams WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!team) return Response.json({ error: "Equipe não encontrada." }, { status: 404 });
  const refError = validateTeamRefs(db, auth.user.organization_id, parsed.data.branchId, parsed.data.memberIds);
  if (refError) return Response.json({ error: refError }, { status: 400 });
  db.transaction(() => {
    db.prepare("UPDATE teams SET name=?, branch_id=?, description=? WHERE id=?")
      .run(parsed.data.name ?? team.name, parsed.data.branchId !== undefined ? parsed.data.branchId : team.branch_id, parsed.data.description ?? team.description, id);
    if (parsed.data.memberIds) {
      db.prepare("DELETE FROM team_members WHERE team_id=?").run(id);
      const insert = db.prepare("INSERT INTO team_members (team_id, user_id) VALUES (?, ?)");
      parsed.data.memberIds.forEach((userId) => insert.run(id, userId));
    }
  })();
  return Response.json({ teams: listTeams(db, auth.user.organization_id) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "ADMIN") return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const db = getDb();
  const team = db.prepare("SELECT * FROM teams WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!team) return Response.json({ error: "Equipe não encontrada." }, { status: 404 });
  const linked = db.prepare("SELECT COUNT(*) count FROM tickets WHERE team_id=?").get(id).count;
  if (linked > 0) return Response.json({ error: "Equipe com chamados vinculados não pode ser excluída." }, { status: 409 });
  db.transaction(() => {
    db.prepare("DELETE FROM team_members WHERE team_id=?").run(id);
    db.prepare("DELETE FROM teams WHERE id=?").run(id);
  })();
  return Response.json({ teams: listTeams(db, auth.user.organization_id) });
}
