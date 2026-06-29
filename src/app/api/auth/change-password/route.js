import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/security";
import { z } from "zod";

export async function POST(request) {
  const user = getCurrentUser(request);
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const limit = rateLimit(`change-password:${user.id}:${clientIp(request)}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);
  const parsed = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
  }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "A nova senha deve ter 8 caracteres, maiúscula, minúscula, número e símbolo." }, { status: 400 });
  if (!user.password_hash || !await bcrypt.compare(parsed.data.currentPassword, user.password_hash)) return Response.json({ error: "Senha atual inválida." }, { status: 401 });
  const hash = await bcrypt.hash(parsed.data.newPassword, 12);
  getDb().prepare("UPDATE users SET password_hash=?, password_reset_required=0 WHERE id=?").run(hash, user.id);
  return Response.json({ ok: true });
}
