import { can, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const branchSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(32).regex(/^[A-Za-z0-9-]+$/, "Use letras, números e hífen."),
  type: z.enum(["MATRIZ", "FILIAL"]),
  city: z.string().max(80).optional().default(""),
  state: z.string().max(2).optional().default(""),
});

export function normalizeBranchCode(code) {
  return code.trim().toUpperCase().replace(/\s+/g, "-");
}

export function listBranches(db, organizationId) {
  return db.prepare(`
    SELECT b.id, b.organization_id, b.name, b.code, b.type, b.city, b.state, b.created_at,
      (SELECT COUNT(*) FROM user_branches ub WHERE ub.branch_id=b.id) user_count,
      (SELECT COUNT(*) FROM assets a WHERE a.branch_id=b.id) asset_count,
      (SELECT COUNT(*) FROM tickets t WHERE t.branch_id=b.id) ticket_count
    FROM branches b
    WHERE b.organization_id=?
    ORDER BY CASE b.type WHEN 'MATRIZ' THEN 0 ELSE 1 END, b.name
  `).all(organizationId);
}

export function branchDependencies(db, branchId) {
  return {
    users: db.prepare("SELECT COUNT(*) total FROM user_branches WHERE branch_id=?").get(branchId).total,
    assets: db.prepare("SELECT COUNT(*) total FROM assets WHERE branch_id=?").get(branchId).total,
    tickets: db.prepare("SELECT COUNT(*) total FROM tickets WHERE branch_id=?").get(branchId).total,
    documents: db.prepare("SELECT COUNT(*) total FROM it_documents WHERE branch_id=?").get(branchId).total,
    knowledge: db.prepare("SELECT COUNT(*) total FROM knowledge_articles WHERE branch_id=?").get(branchId).total,
    network: db.prepare("SELECT COUNT(*) total FROM network_devices WHERE branch_id=?").get(branchId).total,
    terms: db.prepare("SELECT COUNT(*) total FROM equipment_terms WHERE branch_id=?").get(branchId).total,
  };
}

export function validateBranchRules(db, organizationId, data, branchId = null) {
  const code = normalizeBranchCode(data.code);
  const duplicateCode = branchId
    ? db.prepare("SELECT id FROM branches WHERE organization_id=? AND code=? AND id<>?").get(organizationId, code, branchId)
    : db.prepare("SELECT id FROM branches WHERE organization_id=? AND code=?").get(organizationId, code);
  if (duplicateCode) return "Já existe uma unidade com este código.";

  if (data.type === "MATRIZ") {
    const existing = branchId
      ? db.prepare("SELECT id FROM branches WHERE organization_id=? AND type='MATRIZ' AND id<>?").get(organizationId, branchId)
      : db.prepare("SELECT id FROM branches WHERE organization_id=? AND type='MATRIZ'").get(organizationId);
    if (existing) return "A organização já possui uma matriz cadastrada.";
  }

  if (branchId && data.type === "FILIAL") {
    const current = db.prepare("SELECT type FROM branches WHERE id=? AND organization_id=?").get(branchId, organizationId);
    if (current?.type === "MATRIZ") {
      const otherMatrix = db.prepare("SELECT id FROM branches WHERE organization_id=? AND type='MATRIZ' AND id<>?").get(organizationId, branchId);
      if (!otherMatrix) return "Cadastre outra matriz antes de alterar o tipo desta unidade.";
    }
  }

  return null;
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "branches", "read")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  return Response.json({ branches: listBranches(getDb(), auth.user.organization_id) });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "branches", "create")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const body = await request.json();
  const parsed = branchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Revise os dados da unidade." }, { status: 400 });
  const db = getDb();
  const ruleError = validateBranchRules(db, auth.user.organization_id, parsed.data);
  if (ruleError) return Response.json({ error: ruleError }, { status: 400 });
  const id = makeId("br");
  const code = normalizeBranchCode(parsed.data.code);
  db.prepare("INSERT INTO branches (id, organization_id, name, code, type, city, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, auth.user.organization_id, parsed.data.name.trim(), code, parsed.data.type, parsed.data.city?.trim() || null, parsed.data.state?.trim().toUpperCase() || null, new Date().toISOString());

  if (body.authSettings) {
    const { saveBranchAuthSettings } = await import("@/lib/ldap");
    saveBranchAuthSettings(db, id, body.authSettings);
  }

  return Response.json({ branchId: id, branches: listBranches(db, auth.user.organization_id) }, { status: 201 });
}
