import { getDb } from "@/lib/db";
import { getPermissions, requireCurrentUser, can } from "@/lib/auth";
import { sanitizeFilename } from "@/lib/security";
import { buildTermPdf } from "@/lib/term-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const { id } = await params;
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  // PDF do termo expõe PII; exige permissão de módulo além do escopo de filial abaixo.
  if (!can(currentUser, "terms", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const term = db.prepare(`
    SELECT et.*, a.hostname, a.asset_type, a.equipment_type, a.patrimony_number, b.name branch_name,
      tt.title template_title, tt.body_text template_body
    FROM equipment_terms et
    JOIN assets a ON a.id=et.asset_id
    JOIN branches b ON b.id=et.branch_id
    LEFT JOIN term_templates tt ON tt.id=et.term_template_id
    WHERE et.id=? AND et.organization_id=?
  `).get(id, currentUser.organization_id);
  if (!term) return Response.json({ error: "Termo não encontrado." }, { status: 404 });
  // Mesma checagem de filial da rota JSON irmã: evita IDOR entre filiais.
  if (!getPermissions(currentUser).canViewAllBranches && !currentUser.branchIds.includes(term.branch_id)) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }
  const pdf = await buildTermPdf(term);
  const filename = sanitizeFilename(term.pdf_name, `termo-${id}.pdf`);
  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
    },
  });
}
