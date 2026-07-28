import fs from "node:fs/promises";
import path from "node:path";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Serve a foto de perfil dos usuários. Fica sob /api/ de propósito: no modo `output:
// "standalone"` do Next o servidor estático "captura" /uploads/* e devolve 404 para arquivos
// gravados em runtime, nunca chegando a um route handler (ver src/lib/avatar.js).
//
// SEGURANÇA: diferente da logo (que é pública, aparece no login), a foto exige sessão e é
// restrita à organização de quem pede. Entrega APENAS arquivos registrados em users.avatar_url
// — anexos de chamados moram no MESMO diretório (public/uploads) e nunca constam ali, então
// este handler não os expõe; eles seguem só pela rota autenticada /api/attachments/[id].
const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(request, { params }) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;

  const { slug } = await params;
  const segments = Array.isArray(slug) ? slug : [slug];
  // Uploads são arquivos planos (<uuid>.<ext>) sob public/uploads; basename impede traversal.
  const safeName = path.basename(segments[segments.length - 1] || "");
  if (!safeName) return new Response("Not found", { status: 404 });

  const db = getDb();
  const registered = db
    .prepare("SELECT 1 AS ok FROM users WHERE organization_id=? AND avatar_url IN (?, ?) LIMIT 1")
    .get(auth.user.organization_id, `/api/avatars/${safeName}`, `/uploads/${safeName}`);
  if (!registered) return new Response("Not found", { status: 404 });

  let body;
  try {
    body = await fs.readFile(path.join(process.cwd(), "public", "uploads", safeName));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(safeName).toLowerCase();
  return new Response(body, {
    headers: {
      "content-type": CONTENT_TYPES[ext] || "application/octet-stream",
      // O nome é um UUID único por upload — conteúdo imutável por URL. "private" porque,
      // ao contrário da logo, a foto não deve ficar em cache compartilhado.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox; img-src 'self'",
    },
  });
}
