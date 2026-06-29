import { getDb, makeId } from "@/lib/db";
import { getPermissions, requireCurrentUser, can } from "@/lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const termSchema = z.object({
  assetId: z.string().min(1),
  userId: z.string().nullable().optional(),
  signerName: z.string().min(3).max(160),
  signerDocument: z.string().max(80).optional().default(""),
  signatureText: z.string().min(3).max(240),
  bodyText: z.string().min(10).max(50000).optional(),
});

export async function GET(request) {
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  // Termos contêm PII (nome/documento do responsável). Exige permissão de leitura do módulo.
  if (!can(currentUser, "terms", "read")) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const terms = db.prepare(`
    SELECT et.*, a.hostname, a.patrimony_number, b.name branch_name
    FROM equipment_terms et
    JOIN assets a ON a.id=et.asset_id
    JOIN branches b ON b.id=et.branch_id
    WHERE et.organization_id=?
    ORDER BY et.created_at DESC
  `).all(currentUser.organization_id);
  return Response.json({ terms });
}

export async function POST(request) {
  const parsed = termSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Termo inválido.", details: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const permissions = getPermissions(currentUser);
  const asset = db.prepare(`
    SELECT a.*, b.name branch_name
    FROM assets a JOIN branches b ON b.id=a.branch_id
    WHERE a.id=? AND a.organization_id=?
  `).get(parsed.data.assetId, currentUser.organization_id);
  if (!asset) return Response.json({ error: "Ativo não encontrado." }, { status: 404 });
  if (!permissions.canViewAllBranches && !currentUser.branchIds.includes(asset.branch_id)) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const defaultTemplate = db.prepare(`
    SELECT id, title, body_text FROM term_templates
    WHERE organization_id=? AND active=1
    ORDER BY created_at LIMIT 1
  `).get(currentUser.organization_id);
  const bodyText = parsed.data.bodyText || defaultTemplate?.body_text || "Declaro que recebi o equipamento acima, comprometendo-me a zelar pelo uso adequado.";

  const now = new Date();
  const id = makeId("term");
  const fileName = `${id}.pdf`;
  const publicUrl = `/api/terms/${id}/pdf`;
  db.prepare(`INSERT INTO equipment_terms
    (id, organization_id, branch_id, asset_id, user_id, signer_name, signer_document, signature_text, body_text, term_template_id, pdf_name, pdf_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
      currentUser.organization_id,
      asset.branch_id,
      asset.id,
      parsed.data.userId || null,
      parsed.data.signerName,
      parsed.data.signerDocument || null,
      parsed.data.signatureText,
      bodyText,
      defaultTemplate?.id || null,
      fileName,
      publicUrl,
      now.toISOString(),
    );
  return Response.json({ id, pdfUrl: publicUrl }, { status: 201 });
}
