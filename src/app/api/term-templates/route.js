import { can, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(120),
  title: z.string().min(3).max(200),
  bodyText: z.string().min(10).max(50000),
  layoutJson: z.any().optional(),
});

function parseLayout(value) {
  if (!value) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

export function listTermTemplates(db, organizationId) {
  return db.prepare("SELECT * FROM term_templates WHERE organization_id=? ORDER BY active DESC, name").all(organizationId)
    .map((t) => ({ ...t, active: Boolean(t.active), bodyText: t.body_text, layoutJson: parseLayout(t.layout_json) }));
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  // Modelos de termo são de administração; quem opera termos (read) também precisa para preparar.
  if (!can(auth.user, "term_templates", "read") && !can(auth.user, "terms", "read")) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }
  return Response.json({ templates: listTermTemplates(getDb(), auth.user.organization_id) });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "term_templates", "create")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const now = new Date().toISOString();
  const id = makeId("tmpl");
  const layoutValue = parsed.data.layoutJson ? JSON.stringify(parsed.data.layoutJson) : null;
  db.prepare(`INSERT INTO term_templates (id, organization_id, name, title, body_text, body_html, layout_json, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .run(id, auth.user.organization_id, parsed.data.name, parsed.data.title, parsed.data.bodyText, parsed.data.bodyText, layoutValue, now, now);
  return Response.json({ templates: listTermTemplates(db, auth.user.organization_id) }, { status: 201 });
}
