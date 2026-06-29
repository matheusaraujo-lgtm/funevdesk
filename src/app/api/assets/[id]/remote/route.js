import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { createRemoteSession, NEXUS_REMOTE_PROVIDER } from "@/lib/nexus-remote";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const permissions = getPermissions(currentUser);
  if (!permissions.canRemoteAccess) return Response.json({ error: "Seu perfil não possui permissão para acesso remoto." }, { status: 403 });

  const settings = db.prepare("SELECT remote_access_enabled FROM system_settings WHERE organization_id=?").get(currentUser.organization_id);
  if (settings && !settings.remote_access_enabled) return Response.json({ error: "O acesso remoto está desativado nas configurações." }, { status: 409 });

  const asset = db.prepare(`
    SELECT a.*, b.name branch_name
    FROM assets a JOIN branches b ON b.id=a.branch_id
    WHERE a.id=? AND a.organization_id=?
  `).get(id, currentUser.organization_id);
  if (!asset) return Response.json({ error: "Ativo não encontrado." }, { status: 404 });
  if (!permissions.canViewAllBranches && !currentUser.branchIds.includes(asset.branch_id)) return Response.json({ error: "Acesso negado." }, { status: 403 });
  if (asset.status === "OFFLINE") return Response.json({ error: "O agente está offline. Verifique a última comunicação antes de conectar." }, { status: 409 });

  const origin = new URL(request.url).origin;
  const { sessionId } = createRemoteSession(db, {
    organizationId: currentUser.organization_id,
    assetId: asset.id,
    requestedBy: currentUser.id,
    requestedByName: currentUser.name,
    provider: NEXUS_REMOTE_PROVIDER,
    launchUrl: `${origin}/remote/temp`,
  });
  const url = `${origin}/remote/${sessionId}`;
  db.prepare("UPDATE remote_sessions SET launch_url=? WHERE id=?").run(url, sessionId);

  db.prepare(`INSERT INTO audit_logs (id, organization_id, actor_id, actor_name, entity_type, entity_id, action, details, created_at, branch_id)
    VALUES (?, ?, ?, ?, 'ASSET', ?, 'REMOTE_REQUESTED', ?, ?, ?)`)
    .run(makeId("aud"), currentUser.organization_id, currentUser.id, currentUser.name, asset.id,
      `Sessão remota solicitada para ${asset.hostname}.`,
      new Date().toISOString(), asset.branch_id);

  return Response.json({
    mode: "nexus-webrtc",
    url,
    sessionId,
    hostname: asset.hostname,
    ipAddress: asset.ip_address,
    notice: "O colaborador deve aceitar no agente. O console abrirá aqui no sistema.",
  });
}
