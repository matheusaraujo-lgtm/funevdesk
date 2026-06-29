import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Tipos de documento usados na Documentação (it_documents). Lista gerenciável por org.
export function listDocumentTypes(db, organizationId) {
  return db.prepare(
    "SELECT id, name, active, created_at FROM document_types WHERE organization_id=? ORDER BY name COLLATE NOCASE",
  ).all(organizationId).map((row) => ({ id: row.id, name: row.name, active: Boolean(row.active) }));
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const db = getDb();
  return Response.json({ documentTypes: listDocumentTypes(db, auth.user.organization_id) });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canConfigure) {
    return Response.json({ error: "Apenas administradores podem editar os tipos de documento." }, { status: 403 });
  }
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Informe o nome do tipo de documento." }, { status: 400 });

  const db = getDb();
  const exists = db.prepare("SELECT id FROM document_types WHERE organization_id=? AND name=? LIMIT 1").get(auth.user.organization_id, parsed.data.name);
  if (exists) return Response.json({ error: "Já existe um tipo de documento com esse nome." }, { status: 409 });

  db.prepare("INSERT INTO document_types (id, organization_id, name, active, created_at) VALUES (?, ?, ?, 1, ?)")
    .run(makeId("doctype"), auth.user.organization_id, parsed.data.name, new Date().toISOString());
  return Response.json({ documentTypes: listDocumentTypes(db, auth.user.organization_id) }, { status: 201 });
}
