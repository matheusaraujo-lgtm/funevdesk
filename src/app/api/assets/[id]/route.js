import { requireCurrentUser, getPermissions, can } from "@/lib/auth";
import { issueAgentToken } from "@/lib/agent";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  lifecycleStatus: z.enum(["ATIVO", "EM_USO", "MANUTENCAO", "RESERVA", "DESCARTADO"]).optional(),
  warrantyExpiresAt: z.string().nullable().optional(),
  contractVendor: z.string().max(120).optional(),
  contractExpiresAt: z.string().nullable().optional(),
  patrimonyNumber: z.string().max(60).nullable().optional(),
  regenerateAgentToken: z.boolean().optional(),
  active: z.boolean().optional(),
});
export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "assets", "update")) return Response.json({ error: "Sem permissão para modificar ativos." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const asset = db.prepare("SELECT * FROM assets WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!asset) return Response.json({ error: "Ativo não encontrado." }, { status: 404 });
  if (parsed.data.active !== undefined) {
    // Desativar/reativar é restrito a administradores (escopo da organização já validado acima).
    if (!getPermissions(auth.user).canConfigure) {
      return Response.json({ error: "Apenas administradores podem desativar ou reativar ativos." }, { status: 403 });
    }
    db.prepare("UPDATE assets SET active=? WHERE id=? AND organization_id=?")
      .run(parsed.data.active ? 1 : 0, id, auth.user.organization_id);
    return Response.json({ ok: true, active: parsed.data.active ? 1 : 0 });
  }
  if (parsed.data.regenerateAgentToken) {
    // Regeração de token é restrita a administradores (escopo da organização já validado acima).
    if (auth.user.role !== "ADMIN") {
      return Response.json({ error: "Apenas administradores podem regenerar o token do ativo." }, { status: 403 });
    }
    const { plaintext, hash, prefix } = issueAgentToken();
    // Persiste apenas hash + prefixo; o texto puro é devolvido UMA vez para exibição.
    db.prepare("UPDATE assets SET agent_token=NULL, agent_token_hash=?, agent_token_prefix=? WHERE id=?")
      .run(hash, prefix, id);
    return Response.json({ ok: true, agentToken: plaintext, agentTokenPrefix: prefix });
  }
  db.prepare(`UPDATE assets SET lifecycle_status=?, warranty_expires_at=?, contract_vendor=?, contract_expires_at=?, patrimony_number=? WHERE id=?`)    .run(
      parsed.data.lifecycleStatus ?? asset.lifecycle_status ?? "ATIVO",
      parsed.data.warrantyExpiresAt !== undefined ? parsed.data.warrantyExpiresAt : asset.warranty_expires_at,
      parsed.data.contractVendor ?? asset.contract_vendor,
      parsed.data.contractExpiresAt !== undefined ? parsed.data.contractExpiresAt : asset.contract_expires_at,
      parsed.data.patrimonyNumber !== undefined ? (parsed.data.patrimonyNumber || null) : asset.patrimony_number,
      id
    );
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  // Exclusão exige a permissão de apagar no módulo de ativos; escopo de organização validado na busca abaixo.
  if (!can(auth.user, "assets", "delete")) {
    return Response.json({ error: "Sem permissão para excluir ativos." }, { status: 403 });
  }
  const db = getDb();
  const asset = db.prepare("SELECT * FROM assets WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!asset) return Response.json({ error: "Ativo não encontrado." }, { status: 404 });

  // Não apagar histórico de termos assinados: bloqueia se houver termos de equipamento vinculados.
  const termsCount = db.prepare("SELECT COUNT(*) total FROM equipment_terms WHERE asset_id=?").get(id).total;
  if (termsCount > 0) {
    return Response.json(
      { error: "Este ativo possui termos de equipamento vinculados e não pode ser excluído. Desative o ativo para preservar o histórico de termos assinados." },
      { status: 409 }
    );
  }

  const removeAsset = db.transaction(() => {
    // Desvincula referências que impedem a remoção (FKs sem ON DELETE).
    db.prepare("UPDATE tickets SET asset_id=NULL WHERE asset_id=?").run(id);
    db.prepare("UPDATE users SET asset_id=NULL WHERE asset_id=?").run(id);
    // Limpa tabelas dependentes; cada uma em try/catch pois pode não existir nesta instância.
    // remote_sessions tem asset_id NOT NULL + FK sem ON DELETE (bloqueia a remoção);
    // suas remote_signal_messages somem em cascata. asset_inventory/asset_metrics têm
    // ON DELETE CASCADE, mas limpamos explicitamente para robustez.
    for (const table of ["remote_sessions", "asset_inventory", "asset_metrics", "alerts"]) {
      try {
        db.prepare(`DELETE FROM ${table} WHERE asset_id=?`).run(id);
      } catch {
        // tabela ausente nesta instância — ignora
      }
    }
    db.prepare("DELETE FROM assets WHERE id=? AND organization_id=?").run(id, auth.user.organization_id);
  });
  removeAsset();

  return Response.json({ ok: true });
}
