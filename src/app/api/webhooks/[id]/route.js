import { can, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(120).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  active: z.boolean().optional(),
});

function listWebhooks(db, organizationId) {
  return db.prepare("SELECT id, name, url, events_json, active, created_at FROM webhooks WHERE organization_id=? ORDER BY created_at DESC").all(organizationId)
    .map((w) => ({ ...w, active: Boolean(w.active), events: JSON.parse(w.events_json) }));
}

// Ver justificativa em src/app/api/webhooks/route.js: webhook vaza eventos de todas as
// unidades, então exige all_branches além da permissão granular do módulo.
function forbidBranchScoped(user) {
  if (!user.all_branches) return Response.json({ error: "Apenas administradores com acesso a todas as unidades podem gerenciar webhooks." }, { status: 403 });
  return null;
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "webhooks", "update")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const scopeError = forbidBranchScoped(auth.user);
  if (scopeError) return scopeError;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const hook = db.prepare("SELECT * FROM webhooks WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!hook) return Response.json({ error: "Webhook não encontrado." }, { status: 404 });
  db.prepare("UPDATE webhooks SET name=?, url=?, events_json=?, active=? WHERE id=?")
    .run(
      parsed.data.name ?? hook.name,
      parsed.data.url ?? hook.url,
      parsed.data.events ? JSON.stringify(parsed.data.events) : hook.events_json,
      parsed.data.active !== undefined ? (parsed.data.active ? 1 : 0) : hook.active,
      id
    );
  return Response.json({ webhooks: listWebhooks(db, auth.user.organization_id) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "webhooks", "delete")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const scopeError = forbidBranchScoped(auth.user);
  if (scopeError) return scopeError;
  const db = getDb();
  db.prepare("DELETE FROM webhooks WHERE id=? AND organization_id=?").run(id, auth.user.organization_id);
  return Response.json({ webhooks: listWebhooks(db, auth.user.organization_id) });
}
