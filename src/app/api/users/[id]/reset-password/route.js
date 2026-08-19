import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { requireCurrentUser, can, canManageUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { STRONG_PASSWORD_REGEX } from "@/lib/security";
import { z } from "zod";

function temporaryPassword() {
  return `Nx!${crypto.randomBytes(6).toString("base64url")}9a`;
}

const bodySchema = z.object({
  // Opcional: quem redefine escolhe a senha em vez de receber uma gerada pelo sistema.
  password: z.preprocess((value) => (value === "" ? undefined : value), z.string().regex(STRONG_PASSWORD_REGEX).optional()),
});

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  // Redefinir senha faz parte de gerenciar usuários (users:update) — não é exclusivo do admin.
  // Assim um Técnico com a permissão do perfil também consegue redefinir.
  if (!can(currentUser, "users", "update")) {
    return Response.json({ error: "Você não tem permissão para redefinir senhas." }, { status: 403 });
  }
  const db = getDb();
  const user = db.prepare("SELECT id, role, auth_provider FROM users WHERE id=? AND organization_id=?").get(id, currentUser.organization_id);
  if (!user) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
  // Barra escalonamento: um Técnico não redefine a senha de um Admin (patente igual/superior).
  if (!canManageUser(currentUser, user.role)) {
    return Response.json({ error: "Você não pode redefinir a senha deste usuário." }, { status: 403 });
  }
  // Usuário de diretório (LDAP): a senha é gerida no AD, não há hash local para trocar.
  if ((user.auth_provider || "LOCAL") !== "LOCAL") {
    return Response.json({ error: "A senha deste usuário é gerenciada pelo diretório (LDAP) da unidade." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Senha inválida — use ao menos 8 caracteres, com maiúscula, minúscula, número e símbolo." }, { status: 400 });
  // Continua sendo uma senha "temporária" mesmo quando escolhida manualmente: o usuário ainda
  // precisa trocá-la no próximo acesso, só o CONTEÚDO da senha passou a ser opcional escolher.
  const password = parsed.data.password || temporaryPassword();
  const hash = await bcrypt.hash(password, 12);
  db.prepare("UPDATE users SET password_hash=?, password_reset_required=1 WHERE id=?").run(hash, id);
  return Response.json({ temporaryPassword: password, resetRequired: true });
}
