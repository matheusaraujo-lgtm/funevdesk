import { getDb } from "@/lib/db";
import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getScopedXdrAlert, openTicketFromXdrAlert } from "@/lib/security-analyst";
import { explainSecurityAI } from "@/lib/deepseek";

export const dynamic = "force-dynamic";

/**
 * Abre (ou reaproveita) um chamado proativo a partir de um alerta de segurança.
 * A descrição usa a explicação do analista em linguagem simples (regras + IA).
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const permissions = getPermissions(auth.user);
  if (!permissions.canManageTickets) {
    return Response.json({ error: "Apenas a equipe de suporte pode abrir chamados." }, { status: 403 });
  }

  const alert = getScopedXdrAlert(db, id, auth.user, permissions);
  if (!alert) return Response.json({ error: "Alerta não encontrado." }, { status: 404 });

  const detail = [alert.title, alert.description].filter(Boolean).join(" — ");
  const insight = await explainSecurityAI(alert.provider || "XDR", {
    hostname: alert.asset_hostname || alert.hostname,
    os_name: alert.asset_os,
    logged_user: alert.asset_user,
    ip_address: alert.asset_ip,
  }, detail);

  const result = openTicketFromXdrAlert(db, alert, insight);
  if (!result) return Response.json({ error: "Não foi possível abrir o chamado." }, { status: 400 });

  return Response.json({ ok: true, ticket: result });
}
