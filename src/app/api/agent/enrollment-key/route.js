import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { canAccessBranch } from "@/lib/branch-scope";
import { rotateBranchEnrollmentKey } from "@/lib/agent";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ branchId: z.string().min(1) });

// URL pública para a frota (mesma lógica do download): prioriza APP_PUBLIC_URL; senão o 1º host
// de AGENT_ALLOWED_SERVER_HOSTS (https); cai na origem só se não for localhost.
function resolvePublicServerUrl(request) {
  const allowed = (process.env.AGENT_ALLOWED_SERVER_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean);
  let publicUrl = (process.env.APP_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (!publicUrl && allowed[0]) publicUrl = `https://${allowed[0]}`;
  const origin = new URL(request.url).origin;
  try {
    const host = new URL(origin).hostname;
    if (publicUrl && ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)) return publicUrl;
  } catch { /* origem inesperada: usa publicUrl se houver */ }
  return publicUrl || origin;
}

// Gera (rotacionando) a chave de enrollment de UMA FILIAL e devolve o texto puro UMA vez.
// É essa chave que o admin coloca na instalação (config.json / GPO) para o equipamento
// registrar-se naquela unidade. Em repouso guardamos só o hash (em branches.enrollment_key_hash).
export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canConfigure) {
    return Response.json({ error: "Apenas administradores podem gerar a chave de instalação." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Selecione uma unidade." }, { status: 400 });

  const db = getDb();
  const { branchId } = parsed.data;
  if (!canAccessBranch(auth.user, branchId)) {
    return Response.json({ error: "Sem acesso à unidade selecionada." }, { status: 403 });
  }
  const minted = rotateBranchEnrollmentKey(db, auth.user.organization_id, branchId);
  if (!minted) return Response.json({ error: "Unidade inválida." }, { status: 400 });

  const branch = db.prepare("SELECT name FROM branches WHERE id=?").get(branchId);
  return Response.json({
    enrollmentKey: minted.plaintextOnce,
    prefix: minted.prefix,
    branchName: branch?.name || "",
    serverUrl: resolvePublicServerUrl(request),
  });
}
