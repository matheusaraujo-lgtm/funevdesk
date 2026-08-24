import { can, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Histórico de entregas de um webhook — a ferramenta do admin para debugar
// "por que meu sistema não recebeu o evento". Mesma regra de acesso das demais
// rotas de webhooks: permissão do módulo + acesso a todas as unidades (o webhook
// vaza eventos de todas as filiais, então gestão é restrita a quem enxerga tudo).
export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "webhooks", "read")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  if (!auth.user.all_branches) {
    return Response.json({ error: "Apenas administradores com acesso a todas as unidades podem gerenciar webhooks." }, { status: 403 });
  }
  const db = getDb();
  const hook = db.prepare("SELECT id, name FROM webhooks WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!hook) return Response.json({ error: "Webhook não encontrado." }, { status: 404 });
  const deliveries = db.prepare(`
    SELECT id, event_type, status, attempts, response_status, last_error, created_at, completed_at
    FROM webhook_deliveries
    WHERE webhook_id=? AND organization_id=?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(id, auth.user.organization_id);
  return Response.json({ hook: { id: hook.id, name: hook.name }, deliveries });
}
