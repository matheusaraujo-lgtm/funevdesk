import { requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listMacros } from "../route";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  body: z.string().trim().min(2).max(4000).optional(),
});

export async function PUT(request, { params }) {
  const { id } = await params;
  const auth = requirePermission(request, "canned_responses", "update");
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const macro = db.prepare("SELECT * FROM resolution_macros WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!macro) return Response.json({ error: "Macro não encontrada." }, { status: 404 });
  db.prepare("UPDATE resolution_macros SET title=?, body=?, updated_at=? WHERE id=?")
    .run(parsed.data.title?.trim() ?? macro.title, parsed.data.body?.trim() ?? macro.body, new Date().toISOString(), id);
  return Response.json({ macros: listMacros(db, auth.user.organization_id) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requirePermission(request, "canned_responses", "delete");
  if (auth.error) return auth.error;
  const db = getDb();
  const macro = db.prepare("SELECT id FROM resolution_macros WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!macro) return Response.json({ error: "Macro não encontrada." }, { status: 404 });
  db.prepare("DELETE FROM resolution_macros WHERE id=?").run(id);
  return Response.json({ macros: listMacros(db, auth.user.organization_id) });
}
