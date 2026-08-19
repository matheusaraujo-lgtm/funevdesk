import fs from "node:fs/promises";
import path from "node:path";
import { requireCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Serve arquivos enviados via POST /api/uploads e embutidos em conteúdo rich text (artigos de
// conhecimento, documentação, mensagens de chamado). Fica sob /api/ de propósito: no modo
// `output: "standalone"` do Next o servidor estático "captura" /uploads/* e devolve 404 para
// arquivos gravados em runtime, nunca chegando a um route handler (mesmo motivo de
// src/app/api/attachments/[id]/route.js, src/app/api/avatars/[...slug]/route.js e
// src/app/api/branding/logo/[...slug]/route.js).
//
// Diferente de avatar/logo/anexo de chamado, não há registro em banco para estes arquivos (são
// referenciados livremente dentro do HTML salvo). O controle de acesso é exigir sessão válida —
// o nome do arquivo é um UUID não-enumerável, só chega a quem já tinha acesso ao conteúdo que o
// referencia. Isso já é mais restrito que o comportamento anterior (link estático /uploads/<uuid>,
// sem autenticação nenhuma).
const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
};

export async function GET(request, { params }) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;

  const { slug } = await params;
  const segments = Array.isArray(slug) ? slug : [slug];
  // Uploads são arquivos planos (<uuid>.<ext>) sob public/uploads; basename impede traversal.
  const safeName = path.basename(segments[segments.length - 1] || "");
  if (!safeName) return new Response("Not found", { status: 404 });

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
      // Nome é um UUID único por upload — conteúdo imutável por URL.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox; img-src 'self'; media-src 'self'",
    },
  });
}
