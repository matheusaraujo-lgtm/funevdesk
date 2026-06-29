import { z } from "zod";
import { getDb } from "@/lib/db";
import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getScopedXdrAlert, XDR_STATUSES } from "@/lib/security-analyst";

export const dynamic = "force-dynamic";

const schema = z.object({ status: z.enum(XDR_STATUSES) });

/**
 * Triagem de um alerta de segurança — atualiza o status (Novo, Em análise,
 * Resolvido, Falso positivo). Requer perfil de suporte (canManageTickets).
 */
export async function PATCH(request, { params }) {
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Status inválido." }, { status: 400 });

  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const permissions = getPermissions(auth.user);
  if (!permissions.canManageTickets) {
    return Response.json({ error: "Apenas a equipe de suporte pode fazer a triagem." }, { status: 403 });
  }

  const alert = getScopedXdrAlert(db, id, auth.user, permissions);
  if (!alert) return Response.json({ error: "Alerta não encontrado." }, { status: 404 });

  db.prepare("UPDATE xdr_alerts SET status=? WHERE id=?").run(parsed.data.status, id);
  return Response.json({ ok: true, status: parsed.data.status });
}
