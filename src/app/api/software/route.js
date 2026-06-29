import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Catálogo de software por organização (apps que o técnico pode distribuir aos endpoints
// via agente). Curado pelo admin — começa vazio. O ID winget é o identificador do pacote.
export function listSoftwarePackages(db, organizationId) {
  return db.prepare(
    "SELECT id, name, winget_id, active, created_at FROM software_packages WHERE organization_id=? ORDER BY name COLLATE NOCASE",
  ).all(organizationId).map((row) => ({
    id: row.id,
    name: row.name,
    wingetId: row.winget_id,
    active: Boolean(row.active),
  }));
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const db = getDb();
  return Response.json({ packages: listSoftwarePackages(db, auth.user.organization_id) });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canConfigure) {
    return Response.json({ error: "Apenas administradores podem editar o catálogo." }, { status: 403 });
  }
  const parsed = z.object({
    name: z.string().trim().min(1).max(100),
    wingetId: z.string().trim().min(1).max(120),
  }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Informe o nome e o ID winget do aplicativo." }, { status: 400 });

  const db = getDb();
  db.prepare(
    "INSERT INTO software_packages (id, organization_id, name, winget_id, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
  ).run(makeId("sw"), auth.user.organization_id, parsed.data.name, parsed.data.wingetId, new Date().toISOString());
  return Response.json({ packages: listSoftwarePackages(db, auth.user.organization_id) }, { status: 201 });
}
