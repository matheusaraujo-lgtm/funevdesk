import { getDb } from "@/lib/db";
import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getScopedXdrAlert } from "@/lib/security-analyst";
import { explainSecurityAI } from "@/lib/deepseek";

export const dynamic = "force-dynamic";

/**
 * Análise sob demanda de um alerta de segurança — traduz a ameaça em linguagem
 * simples, com triagem e ações de contenção (motor de regras + DeepSeek).
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const permissions = getPermissions(auth.user);
  if (!permissions.canViewAssets) {
    return Response.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const alert = getScopedXdrAlert(db, id, auth.user, permissions);
  if (!alert) return Response.json({ error: "Alerta não encontrado." }, { status: 404 });

  const detail = [alert.title, alert.description].filter(Boolean).join(" — ");
  const insight = await explainSecurityAI(alert.provider || "XDR", {
    hostname: alert.asset_hostname || alert.hostname,
    os_name: alert.asset_os,
  }, detail);

  return Response.json({ insight });
}
