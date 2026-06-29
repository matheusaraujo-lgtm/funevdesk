import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

function temporaryPassword() {
  return `Nx!${crypto.randomBytes(6).toString("base64url")}9a`;
}

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (currentUser.role !== "ADMIN") return Response.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  const db = getDb();
  const user = db.prepare("SELECT id FROM users WHERE id=? AND organization_id=?").get(id, currentUser.organization_id);
  if (!user) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
  const password = temporaryPassword();
  const hash = await bcrypt.hash(password, 12);
  db.prepare("UPDATE users SET password_hash=?, password_reset_required=1 WHERE id=?").run(hash, id);
  return Response.json({ temporaryPassword: password, resetRequired: true });
}
