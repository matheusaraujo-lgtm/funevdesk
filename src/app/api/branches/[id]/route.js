import { can, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  branchDependencies,
  branchSchema,
  listBranches,
  normalizeBranchCode,
  validateBranchRules,
} from "@/app/api/branches/route";
import { getBranchAuthSettings, saveBranchAuthSettings } from "@/lib/ldap";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function PUT(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "branches", "update")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const body = await request.json();
  const parsed = branchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Revise os dados da unidade." }, { status: 400 });
  const db = getDb();
  const branch = db.prepare("SELECT * FROM branches WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!branch) return Response.json({ error: "Unidade não encontrada." }, { status: 404 });
  const ruleError = validateBranchRules(db, auth.user.organization_id, parsed.data, id);
  if (ruleError) return Response.json({ error: ruleError }, { status: 400 });
  const code = normalizeBranchCode(parsed.data.code);
  db.prepare("UPDATE branches SET name=?, code=?, type=?, city=?, state=? WHERE id=?")
    .run(parsed.data.name.trim(), code, parsed.data.type, parsed.data.city?.trim() || null, parsed.data.state?.trim().toUpperCase() || null, id);

  if (body.authSettings) {
    const authSettingsSchema = z.object({
      authMode: z.enum(["LOCAL", "LDAP"]).default("LOCAL"),
      ldapEnabled: z.boolean().optional().default(false),
      ldapUrl: z.string().max(300).optional().default(""),
      ldapBaseDn: z.string().max(300).optional().default(""),
      ldapBindDn: z.string().max(300).optional().default(""),
      ldapBindPassword: z.string().max(300).optional().default(""),
      ldapUserFilter: z.string().max(300).optional().default("(mail={{email}})"),
    });
    const authParsed = authSettingsSchema.safeParse(body.authSettings);
    if (!authParsed.success) return Response.json({ error: "Configuração LDAP inválida." }, { status: 400 });
    saveBranchAuthSettings(db, id, authParsed.data);
  }

  return Response.json({ branches: listBranches(db, auth.user.organization_id) });
}

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "branches", "read")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const db = getDb();
  const branch = db.prepare("SELECT * FROM branches WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!branch) return Response.json({ error: "Unidade não encontrada." }, { status: 404 });
  const authSettings = getBranchAuthSettings(db, id);
  return Response.json({
    branch,
    authSettings: {
      authMode: authSettings.auth_mode || "LOCAL",
      ldapEnabled: Boolean(authSettings.ldap_enabled),
      ldapUrl: authSettings.ldap_url || "",
      ldapBaseDn: authSettings.ldap_base_dn || "",
      ldapBindDn: authSettings.ldap_bind_dn || "",
      ldapUserFilter: authSettings.ldap_user_filter || "(mail={{email}})",
      hasBindPassword: Boolean(authSettings.ldap_bind_password),
    },
  });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "branches", "delete")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const db = getDb();
  const branch = db.prepare("SELECT * FROM branches WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!branch) return Response.json({ error: "Unidade não encontrada." }, { status: 404 });
  const deps = branchDependencies(db, id);
  const total = Object.values(deps).reduce((sum, count) => sum + count, 0);
  if (total > 0) {
    const parts = [];
    if (deps.users) parts.push(`${deps.users} usuário(s)`);
    if (deps.assets) parts.push(`${deps.assets} equipamento(s)`);
    if (deps.tickets) parts.push(`${deps.tickets} chamado(s)`);
    if (deps.documents) parts.push(`${deps.documents} documento(s)`);
    if (deps.knowledge) parts.push(`${deps.knowledge} artigo(s)`);
    if (deps.network) parts.push(`${deps.network} dispositivo(s) de rede`);
    if (deps.terms) parts.push(`${deps.terms} termo(s)`);
    return Response.json({ error: `Não é possível excluir: a unidade possui ${parts.join(", ")} vinculados.` }, { status: 409 });
  }
  if (branch.type === "MATRIZ") {
    const filiais = db.prepare("SELECT COUNT(*) total FROM branches WHERE organization_id=? AND type='FILIAL'").get(auth.user.organization_id).total;
    if (filiais > 0) return Response.json({ error: "Remova ou reclassifique as filiais antes de excluir a matriz." }, { status: 409 });
  }
  db.prepare("DELETE FROM branches WHERE id=?").run(id);
  return Response.json({ branches: listBranches(db, auth.user.organization_id) });
}
