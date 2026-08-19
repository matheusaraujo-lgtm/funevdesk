import { can, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { assertSafeOutboundUrl } from "@/lib/security";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(120),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  // Se informado, exige segredo forte (>=16 chars) para assinatura HMAC útil.
  secret: z.string().min(16).max(120).optional().or(z.literal("")),
});

// Um webhook assina eventos (ex.: TICKET_NEW) de TODAS as unidades da organização — não
// tem como restringir o disparo a uma unidade. Por isso, além da permissão granular do
// módulo, exige all_branches: um usuário restrito a uma unidade não pode criar uma
// integração que vaza dados de chamados de outras unidades pra fora do sistema.
function forbidBranchScoped(user) {
  if (!user.all_branches) return Response.json({ error: "Apenas administradores com acesso a todas as unidades podem gerenciar webhooks." }, { status: 403 });
  return null;
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "webhooks", "read")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const scopeError = forbidBranchScoped(auth.user);
  if (scopeError) return scopeError;
  const webhooks = getDb().prepare("SELECT id, name, url, events_json, active, created_at FROM webhooks WHERE organization_id=? ORDER BY created_at DESC").all(auth.user.organization_id)
    .map((w) => ({ ...w, active: Boolean(w.active), events: JSON.parse(w.events_json) }));
  return Response.json({ webhooks });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "webhooks", "create")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const scopeError = forbidBranchScoped(auth.user);
  if (scopeError) return scopeError;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos. O segredo, se informado, deve ter ao menos 16 caracteres." }, { status: 400 });
  try {
    await assertSafeOutboundUrl(parsed.data.url);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  const db = getDb();
  const id = makeId("whk");
  db.prepare("INSERT INTO webhooks (id, organization_id, name, url, events_json, secret, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)")
    .run(id, auth.user.organization_id, parsed.data.name, parsed.data.url, JSON.stringify(parsed.data.events), parsed.data.secret || null, new Date().toISOString());
  return Response.json({ ok: true, id }, { status: 201 });
}
