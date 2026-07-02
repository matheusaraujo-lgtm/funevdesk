import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Serve a logo do sistema (branding PÚBLICO — aparece inclusive na tela de login, ANTES
// da autenticação). Fica sob /api/ de propósito: no modo `output: "standalone"` do Next
// o servidor estático "captura" /uploads/* e devolve 404 para arquivos gravados em runtime,
// nunca chegando a um route handler. /api/... não tem essa colisão.
//
// SEGURANÇA: entrega APENAS arquivos registrados como logo de alguma organização em
// system_settings. Anexos de chamados moram no MESMO diretório (public/uploads) e seguem
// acessíveis só pela rota autenticada /api/attachments/[id] — eles nunca constam em
// logo_url, então este handler nunca os expõe.
const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_request, { params }) {
  const { slug } = await params;
  const segments = Array.isArray(slug) ? slug : [slug];
  // Uploads são arquivos planos (<uuid>.<ext>) sob public/uploads; basename impede traversal.
  const safeName = path.basename(segments[segments.length - 1] || "");
  if (!safeName) return new Response("Not found", { status: 404 });

  // Aceita as duas formas que podem estar gravadas em logo_url: a nova
  // (/api/branding/logo/<arquivo>) e a legada (/uploads/<arquivo>).
  const db = getDb();
  const registered = db
    .prepare("SELECT 1 AS ok FROM system_settings WHERE logo_url IN (?, ?) LIMIT 1")
    .get(`/api/branding/logo/${safeName}`, `/uploads/${safeName}`);
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
      // O nome é um UUID único por upload — conteúdo imutável por URL.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox; img-src 'self'; media-src 'self'",
    },
  });
}
