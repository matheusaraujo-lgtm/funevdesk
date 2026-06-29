import { can, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listTermTemplates } from "../route";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(120).optional(),
  title: z.string().min(3).max(200).optional(),
  bodyText: z.string().min(10).max(50000).optional(),
  layoutJson: z.any().optional(),
  active: z.boolean().optional(),
});

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "term_templates", "read") && !can(auth.user, "terms", "read")) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }
  const db = getDb();
  const template = db.prepare("SELECT * FROM term_templates WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!template) return Response.json({ error: "Modelo não encontrado." }, { status: 404 });
  let layoutJson = null;
  try {
    layoutJson = template.layout_json ? JSON.parse(template.layout_json) : null;
  } catch {
    layoutJson = null;
  }
  return Response.json({
    template: {
      ...template,
      bodyText: template.body_text,
      layoutJson,
      active: Boolean(template.active),
    },
  });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "term_templates", "update")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const template = db.prepare("SELECT * FROM term_templates WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!template) return Response.json({ error: "Modelo não encontrado." }, { status: 404 });
  const now = new Date().toISOString();
  const bodyText = parsed.data.bodyText ?? template.body_text;
  const layoutValue = parsed.data.layoutJson !== undefined
    ? (parsed.data.layoutJson ? JSON.stringify(parsed.data.layoutJson) : null)
    : template.layout_json;
  db.prepare(`UPDATE term_templates SET name=?, title=?, body_text=?, body_html=?, layout_json=?, active=?, updated_at=? WHERE id=?`)
    .run(
      parsed.data.name ?? template.name,
      parsed.data.title ?? template.title,
      bodyText,
      bodyText,
      layoutValue,
      parsed.data.active !== undefined ? (parsed.data.active ? 1 : 0) : template.active,
      now,
      id
    );
  return Response.json({ templates: listTermTemplates(db, auth.user.organization_id) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "term_templates", "delete")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const db = getDb();
  const linked = db.prepare("SELECT COUNT(*) count FROM ticket_types WHERE term_template_id=?").get(id).count;
  if (linked > 0) return Response.json({ error: "Modelo vinculado a tipos de chamado." }, { status: 409 });
  db.prepare("DELETE FROM term_templates WHERE id=? AND organization_id=?").run(id, auth.user.organization_id);
  return Response.json({ templates: listTermTemplates(db, auth.user.organization_id) });
}
