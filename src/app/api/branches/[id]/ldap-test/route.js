import { can, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getBranchAuthSettings, testLdapConnection } from "@/lib/ldap";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Permite testar com valores ainda não salvos no formulário (senha em branco = usa a
// já salva, mesma convenção de saveBranchAuthSettings) — assim o admin testa antes de gravar.
const overrideSchema = z.object({
  ldapUrl: z.string().max(300).optional().default(""),
  ldapBaseDn: z.string().max(300).optional().default(""),
  ldapBindDn: z.string().max(300).optional().default(""),
  ldapBindPassword: z.string().max(300).optional().default(""),
});

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "branches", "update")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const db = getDb();
  const branch = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!branch) return Response.json({ error: "Unidade não encontrada." }, { status: 404 });

  const parsed = overrideSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  const saved = getBranchAuthSettings(db, id);
  const settings = {
    ldapUrl: parsed.data.ldapUrl || saved.ldap_url || "",
    ldapBaseDn: parsed.data.ldapBaseDn || saved.ldap_base_dn || "",
    ldapBindDn: parsed.data.ldapBindDn || saved.ldap_bind_dn || "",
    ldapBindPassword: parsed.data.ldapBindPassword || saved.ldap_bind_password || "",
  };
  const result = await testLdapConnection(settings);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
