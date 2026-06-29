import { requireCurrentUser, getPermissions } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  targetAssetId: z.string().min(1),
  relationshipType: z.enum(["DEPENDS_ON", "CONNECTS_TO", "HOSTS"]).default("DEPENDS_ON"),
});

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canViewAssets) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const db = getDb();
  // Valida o ativo de origem por org + unidade (mesmo escopo de metrics/inventory) antes de
  // expor a topologia — impede que técnico de outra unidade veja relacionamentos fora do escopo.
  const source = db.prepare("SELECT branch_id FROM assets WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!source) return Response.json({ error: "Ativo não encontrado." }, { status: 404 });
  if (auth.user.role !== "ADMIN" && source.branch_id && !auth.user.branchIds.includes(source.branch_id)) {
    return Response.json({ error: "Ativo não encontrado." }, { status: 404 });
  }
  const rels = db.prepare(`
    SELECT r.*, a.hostname target_hostname, a.asset_type target_type
    FROM asset_relationships r
    JOIN assets a ON a.id=r.target_asset_id
    WHERE r.source_asset_id=? AND r.organization_id=?
  `).all(id, auth.user.organization_id);
  return Response.json({ relationships: rels });
}

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role === "EMPLOYEE") return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const source = db.prepare("SELECT id FROM assets WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  const target = db.prepare("SELECT id FROM assets WHERE id=? AND organization_id=?").get(parsed.data.targetAssetId, auth.user.organization_id);
  if (!source || !target) return Response.json({ error: "Ativo inválido." }, { status: 404 });
  const relId = makeId("rel");
  db.prepare("INSERT INTO asset_relationships (id, organization_id, source_asset_id, target_asset_id, relationship_type, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(relId, auth.user.organization_id, id, parsed.data.targetAssetId, parsed.data.relationshipType, new Date().toISOString());
  return Response.json({ id: relId }, { status: 201 });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role === "EMPLOYEE") return Response.json({ error: "Acesso negado." }, { status: 403 });
  const relationshipId = new URL(request.url).searchParams.get("relationshipId");
  if (!relationshipId) return Response.json({ error: "Informe o relacionamento." }, { status: 400 });
  const db = getDb();
  const rel = db.prepare("SELECT id FROM asset_relationships WHERE id=? AND source_asset_id=? AND organization_id=?")
    .get(relationshipId, id, auth.user.organization_id);
  if (!rel) return Response.json({ error: "Relacionamento não encontrado." }, { status: 404 });
  db.prepare("DELETE FROM asset_relationships WHERE id=?").run(relationshipId);
  return Response.json({ ok: true });
}
