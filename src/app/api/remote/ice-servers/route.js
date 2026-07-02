import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getIceServers } from "@/lib/ice";

export const dynamic = "force-dynamic";

// Entrega a config ICE (STUN/TURN) ao console do técnico. Protegido: exige sessão válida e
// permissão de acesso remoto (as credenciais de TURN não devem vazar para usuários sem acesso).
export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canRemoteAccess) {
    return Response.json({ error: "Sem permissão para acesso remoto." }, { status: 403 });
  }
  return Response.json({ iceServers: getIceServers() });
}
