import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";

export async function verifyUserPassword(userId, password) {
  if (!userId || !password) return { ok: false, error: "Informe sua senha." };
  const db = getDb();
  const user = db.prepare("SELECT id, password_hash, auth_provider, active FROM users WHERE id=?").get(userId);
  if (!user?.active) return { ok: false, error: "Usuário inválido." };
  if ((user.auth_provider || "LOCAL") === "LDAP") {
    return { ok: false, error: "Confirmação por senha disponível apenas para contas locais." };
  }
  if (!user.password_hash || !await bcrypt.compare(password, user.password_hash)) {
    return { ok: false, error: "Senha incorreta." };
  }
  return { ok: true };
}
