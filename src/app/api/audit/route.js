import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { branchFilterClause, getAllowedBranchIds } from "@/lib/branch-scope";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  branchId: z.string().min(1).nullish(),
  action: z.string().min(1).nullish(),
  entityType: z.string().min(1).nullish(),
  from: z.string().min(1).nullish(),
  to: z.string().min(1).nullish(),
});

// Normaliza uma data (YYYY-MM-DD ou ISO) para os limites do dia em ISO,
// compatível com created_at gravado como ISO string.
function dayBoundary(value, edge) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (edge === "end") date.setHours(23, 59, 59, 999);
    else date.setHours(0, 0, 0, 0);
  }
  return date.toISOString();
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "ADMIN") return Response.json({ error: "Acesso restrito." }, { status: 403 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "Parâmetros inválidos.", details: parsed.error.flatten() }, { status: 400 });
  const { page, limit, branchId, action, entityType, from, to } = parsed.data;

  const db = getDb();
  const scopedBranchIds = getAllowedBranchIds(auth.user, db, branchId || null);
  const branchScope = branchFilterClause(scopedBranchIds, "branch_id");

  const conditions = [`organization_id=?`, `(${branchScope.clause} OR branch_id IS NULL)`];
  const params = [auth.user.organization_id, ...branchScope.params];

  if (action) { conditions.push("action=?"); params.push(action); }
  if (entityType) { conditions.push("entity_type=?"); params.push(entityType); }
  const fromIso = from ? dayBoundary(from, "start") : null;
  if (fromIso) { conditions.push("created_at>=?"); params.push(fromIso); }
  const toIso = to ? dayBoundary(to, "end") : null;
  if (toIso) { conditions.push("created_at<=?"); params.push(toIso); }

  const where = conditions.join(" AND ");

  const total = db.prepare(`SELECT COUNT(*) AS count FROM audit_logs WHERE ${where}`).get(...params).count;
  const offset = (page - 1) * limit;
  const logs = db.prepare(`
    SELECT * FROM audit_logs
    WHERE ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  // Listas distintas para popular os selects de filtro (escopo respeitado).
  const scopeWhere = `organization_id=? AND (${branchScope.clause} OR branch_id IS NULL)`;
  const scopeParams = [auth.user.organization_id, ...branchScope.params];
  const actions = db.prepare(`SELECT DISTINCT action FROM audit_logs WHERE ${scopeWhere} ORDER BY action`).all(...scopeParams).map((row) => row.action).filter(Boolean);
  const entityTypes = db.prepare(`SELECT DISTINCT entity_type FROM audit_logs WHERE ${scopeWhere} ORDER BY entity_type`).all(...scopeParams).map((row) => row.entity_type).filter(Boolean);

  return Response.json({ logs, total, page, limit, filters: { actions, entityTypes } });
}
