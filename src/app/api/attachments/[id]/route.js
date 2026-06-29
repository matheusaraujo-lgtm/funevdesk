import fs from "node:fs/promises";
import path from "node:path";
import { requireCurrentUser, canAccessTicket } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Download de anexo com ISOLAMENTO MULTI-TENANT: valida a sessão e resolve o anexo até o
// chamado dono, aplicando canAccessTicket (mesma organização + escopo de papel/unidade).
// Substitui o link público direto (/uploads/<uuid>), que era acessível sem autenticação.
export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;

  const db = getDb();
  const attachment = db.prepare(`
    SELECT a.stored_name, a.original_name, a.mime_type,
      t.id, t.organization_id, t.branch_id, t.requester_id, t.asset_id
    FROM attachments a
    JOIN tickets t ON t.id=a.ticket_id
    WHERE a.id=?
  `).get(id);
  if (!attachment || !canAccessTicket(auth.user, attachment)) {
    return Response.json({ error: "Anexo não encontrado." }, { status: 404 });
  }

  // stored_name é gerado pelo servidor (UUID), mas basename garante que nenhum path traversal
  // escape do diretório de uploads.
  const safeName = path.basename(attachment.stored_name || "");
  if (!safeName) return Response.json({ error: "Anexo indisponível." }, { status: 404 });

  let body;
  try {
    body = await fs.readFile(path.join(process.cwd(), "public", "uploads", safeName));
  } catch {
    return Response.json({ error: "Arquivo indisponível." }, { status: 404 });
  }

  return new Response(body, {
    headers: {
      "content-type": attachment.mime_type || "application/octet-stream",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.original_name || safeName)}`,
      // Conteúdo de usuário: nunca interpretar como HTML executável.
      "content-security-policy": "default-src 'none'; sandbox; img-src 'self'; media-src 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
