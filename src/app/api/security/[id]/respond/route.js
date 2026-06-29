import { getDb, makeId } from "@/lib/db";
import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getScopedXdrAlert } from "@/lib/security-analyst";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Ações de resposta a incidente despachadas ao agente do endpoint.
const ACTIONS = {
  ISOLATE: "Isolar host da rede",
  UNISOLATE: "Reconectar host à rede",
  SCAN: "Varredura completa de antivírus",
};

const schema = z.object({ action: z.enum(["ISOLATE", "UNISOLATE", "SCAN"]) });

/**
 * Enfileira uma ação de resposta a incidente (isolar host, reconectar, varredura)
 * para o agente do ativo vinculado ao alerta. O agente busca o comando no próximo
 * heartbeat, executa e reporta o resultado.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const permissions = getPermissions(auth.user);
  if (!permissions.canManageTickets) {
    return Response.json({ error: "Apenas a equipe de suporte pode responder a incidentes." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Ação inválida." }, { status: 400 });

  const alert = getScopedXdrAlert(db, id, auth.user, permissions);
  if (!alert) return Response.json({ error: "Alerta não encontrado." }, { status: 404 });
  if (!alert.asset_id) return Response.json({ error: "O alerta não está vinculado a um equipamento com agente." }, { status: 409 });

  const action = parsed.data.action;
  // Evita comandos duplicados pendentes da mesma ação para o mesmo ativo.
  const pending = db.prepare("SELECT id FROM agent_commands WHERE asset_id=? AND command=? AND status='PENDING'").get(alert.asset_id, action);
  if (pending) return Response.json({ error: "Já existe um comando pendente desta ação para o equipamento." }, { status: 409 });

  const now = new Date().toISOString();
  const commandId = makeId("cmd");
  db.prepare(`INSERT INTO agent_commands (id, organization_id, asset_id, command, params_json, status, created_by, created_by_name, alert_id, created_at)
    VALUES (?, ?, ?, ?, NULL, 'PENDING', ?, ?, ?, ?)`)
    .run(commandId, auth.user.organization_id, alert.asset_id, action, auth.user.id, auth.user.name, alert.id, now);

  db.prepare(`INSERT INTO audit_logs (id, organization_id, actor_id, actor_name, entity_type, entity_id, action, details, created_at, branch_id)
    VALUES (?, ?, ?, ?, 'SECURITY', ?, 'INCIDENT_RESPONSE', ?, ?, ?)`)
    .run(makeId("aud"), auth.user.organization_id, auth.user.id, auth.user.name, alert.id,
      `Resposta a incidente: "${ACTIONS[action]}" no equipamento do alerta "${alert.title}".`, now, alert.branch_id || null);

  return Response.json({ ok: true, commandId, action, label: ACTIONS[action] });
}
