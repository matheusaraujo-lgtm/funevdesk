import { getDb, makeId } from "@/lib/db";
import { requireCurrentUser, can } from "@/lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["INSTALL_APP", "UNINSTALL_APP"]).default("INSTALL_APP"),
  // ID winget (App Installer): alfanumérico com . _ + - (ex.: Google.Chrome, 7zip.7zip).
  // A mesma validação roda no agente antes de tocar no PowerShell — defesa em profundidade.
  packageId: z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._+-]+$/, "Identificador de pacote inválido."),
  name: z.string().max(120).optional(),
});

/** Histórico de comandos de software (instalar/desinstalar) deste ativo, mais recentes primeiro. */
export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "assets", "read")) {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }
  const db = getDb();
  const asset = db.prepare("SELECT id FROM assets WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!asset) return Response.json({ error: "Ativo não encontrado." }, { status: 404 });
  const rows = db.prepare(`SELECT id, command, params_json, status, result, created_by_name, created_at, completed_at
    FROM agent_commands WHERE asset_id=? AND command IN ('INSTALL_APP','UNINSTALL_APP') ORDER BY created_at DESC LIMIT 12`).all(asset.id);
  const commands = rows.map((r) => {
    let p = {};
    try { p = r.params_json ? JSON.parse(r.params_json) : {}; } catch { /* params corrompido — ignora */ }
    return {
      id: r.id, command: r.command, status: r.status, result: r.result,
      label: p.name || p.packageId || "—", createdByName: r.created_by_name,
      createdAt: r.created_at, completedAt: r.completed_at,
    };
  });
  return Response.json({ commands });
}

/**
 * Distribuição remota de software: enfileira a instalação (ou desinstalação) de um app
 * via winget para o agente do ativo. O agente busca o comando no próximo heartbeat,
 * executa em silêncio e reporta o resultado. Como os RMM/EPP de mercado.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  // Distribuir software no endpoint é uma ação de gestão de ativos.
  if (!can(auth.user, "assets", "update")) {
    return Response.json({ error: "Sem permissão para distribuir software nos ativos." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues?.[0]?.message || "Dados inválidos." }, { status: 400 });
  }

  const db = getDb();
  const asset = db.prepare("SELECT * FROM assets WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!asset) return Response.json({ error: "Ativo não encontrado." }, { status: 404 });
  if (!asset.agent_token_hash && !asset.agent_token) {
    return Response.json({ error: "Este ativo não possui agente instalado." }, { status: 409 });
  }

  const { action, packageId, name } = parsed.data;
  const label = name || packageId;
  const paramsJson = JSON.stringify({ packageId, name: label });

  // Evita enfileirar o mesmo pacote duas vezes enquanto o anterior não foi processado.
  const pending = db.prepare("SELECT id FROM agent_commands WHERE asset_id=? AND command=? AND status IN ('PENDING','SENT') AND params_json=?")
    .get(asset.id, action, paramsJson);
  if (pending) {
    return Response.json({ error: `Já existe um comando pendente para "${label}" neste equipamento.` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const commandId = makeId("cmd");
  db.prepare(`INSERT INTO agent_commands (id, organization_id, asset_id, command, params_json, status, created_by, created_by_name, alert_id, created_at)
    VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, NULL, ?)`)
    .run(commandId, auth.user.organization_id, asset.id, action, paramsJson, auth.user.id, auth.user.name, now);

  const verbo = action === "UNINSTALL_APP" ? "Desinstalação remota" : "Instalação remota";
  db.prepare(`INSERT INTO audit_logs (id, organization_id, actor_id, actor_name, entity_type, entity_id, action, details, created_at, branch_id)
    VALUES (?, ?, ?, ?, 'ASSET', ?, 'SOFTWARE_DEPLOY', ?, ?, ?)`)
    .run(makeId("aud"), auth.user.organization_id, auth.user.id, auth.user.name, asset.id,
      `${verbo} de "${label}" no equipamento ${asset.hostname}.`, now, asset.branch_id || null);

  return Response.json({ ok: true, commandId, action, label });
}
