import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { toServableAvatarUrl } from "@/lib/avatar";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Só aceita o caminho canônico devolvido por POST /api/uploads (que já valida tipo, tamanho e
// magic bytes). Recusar URL arbitrária é proposital: senão daria para apontar a foto para um
// host externo, que vazaria o IP de quem abre a tela e permitiria trocar a imagem depois.
// A extensão é limitada a imagem porque /api/uploads também aceita PDF e vídeo.
const schema = z.object({
  avatarUrl: z.string().regex(/^\/uploads\/[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif)$/i),
});

// Qualquer usuário autenticado mexe na PRÓPRIA foto (auth.user.id) — não há id na rota, então
// não existe superfície para alterar a foto de outra pessoa.
export async function PUT(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Envie uma imagem PNG, JPG, WEBP ou GIF." }, { status: 400 });
  }
  getDb().prepare("UPDATE users SET avatar_url=? WHERE id=?").run(parsed.data.avatarUrl, auth.user.id);
  return Response.json({ avatarUrl: toServableAvatarUrl(parsed.data.avatarUrl) });
}

export async function DELETE(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  getDb().prepare("UPDATE users SET avatar_url=NULL WHERE id=?").run(auth.user.id);
  return Response.json({ avatarUrl: "" });
}
