import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getSlaStatus } from "@/lib/sla";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  branchId: z.string().min(1).optional(),
  period: z.enum(["7d", "30d", "90d", "month", "all"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// Resolve o intervalo [from, to] em ISO a partir dos parâmetros validados.
// Intervalo explícito (from/to) tem prioridade sobre o atalho de período.
function resolveRange({ period, from, to }) {
  if (from || to) return { from: from || null, to: to || null };
  if (!period || period === "all") return { from: null, to: null };
  const now = new Date();
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start.toISOString(), to: null };
  }
  const days = { "7d": 7, "30d": 30, "90d": 90 }[period];
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: null };
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "ADMIN") return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const db = getDb();
  const orgId = auth.user.organization_id;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Parâmetros inválidos." }, { status: 400 });
  const { branchId } = parsed.data;
  const { from, to } = resolveRange(parsed.data);

  let ticketQuery = `SELECT t.*, b.name branch_name FROM tickets t JOIN branches b ON b.id=t.branch_id WHERE t.organization_id=?`;
  const ticketParams = [orgId];
  if (branchId) { ticketQuery += " AND t.branch_id=?"; ticketParams.push(branchId); }
  if (from) { ticketQuery += " AND t.created_at>=?"; ticketParams.push(from); }
  if (to) { ticketQuery += " AND t.created_at<=?"; ticketParams.push(to); }
  const tickets = db.prepare(ticketQuery).all(...ticketParams);

  const resolved = tickets.filter((t) => t.status === "RESOLVIDO");
  const mttrHours = resolved.length ? resolved.reduce((sum, t) => {
    const start = new Date(t.created_at).getTime();
    const end = new Date(t.resolved_at || t.updated_at).getTime();
    return sum + (end - start) / 3600000;
  }, 0) / resolved.length : 0;

  // Tempo médio até a primeira resposta de um técnico (em horas).
  const responded = tickets.filter((t) => t.first_response_at);
  const firstResponseHours = responded.length ? responded.reduce((sum, t) => {
    return sum + (new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
  }, 0) / responded.length : 0;

  // Cumprimento do SLA de 1ª resposta: dos chamados respondidos com meta definida, quantos responderam no prazo.
  const withFrTarget = tickets.filter((t) => t.first_response_due_at && t.first_response_at);
  const frMet = withFrTarget.filter((t) => new Date(t.first_response_at).getTime() <= new Date(t.first_response_due_at).getTime()).length;
  const firstResponseSlaPercent = withFrTarget.length ? Math.round((frMet / withFrTarget.length) * 100) : null;

  const slaViolations = tickets.filter((t) => getSlaStatus(t.sla_due_at, t.status) === "VIOLADO").length;
  const csatScores = tickets.filter((t) => t.csat_score).map((t) => t.csat_score);
  const csatAvg = csatScores.length ? csatScores.reduce((a, b) => a + b, 0) / csatScores.length : null;

  // Agregado por unidade respeitando o mesmo filtro de data (e organização) aplicado aos chamados.
  let byBranchQuery = `
    SELECT b.name, COUNT(t.id) total,
      SUM(CASE WHEN t.status='RESOLVIDO' THEN 1 ELSE 0 END) resolved
    FROM branches b LEFT JOIN tickets t ON t.branch_id=b.id AND t.organization_id=?`;
  const byBranchParams = [orgId];
  if (from) { byBranchQuery += " AND t.created_at>=?"; byBranchParams.push(from); }
  if (to) { byBranchQuery += " AND t.created_at<=?"; byBranchParams.push(to); }
  byBranchQuery += " WHERE b.organization_id=?";
  byBranchParams.push(orgId);
  if (branchId) { byBranchQuery += " AND b.id=?"; byBranchParams.push(branchId); }
  byBranchQuery += " GROUP BY b.id ORDER BY total DESC";

  // Série temporal: criados vs. resolvidos por dia (até 90 pontos) para o gráfico de tendência.
  const dayKey = (iso) => (iso ? String(iso).slice(0, 10) : null);
  const trendStart = from ? new Date(from) : new Date(Date.now() - 29 * 864e5);
  const trendEnd = to ? new Date(to) : new Date();
  const days = [];
  for (let d = new Date(trendStart.getFullYear(), trendStart.getMonth(), trendStart.getDate()); d <= trendEnd; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  const trendDays = days.slice(-90);
  const createdByDay = {};
  const resolvedByDay = {};
  for (const t of tickets) { const c = dayKey(t.created_at); if (c) createdByDay[c] = (createdByDay[c] || 0) + 1; }
  for (const t of resolved) { const r = dayKey(t.resolved_at || t.updated_at); if (r) resolvedByDay[r] = (resolvedByDay[r] || 0) + 1; }
  const trend = trendDays.map((day) => ({ day, created: createdByDay[day] || 0, resolved: resolvedByDay[day] || 0 }));

  // Comparação com o período anterior de mesma duração (variação %).
  let previous = null;
  if (from) {
    const dur = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime();
    const prevFrom = new Date(new Date(from).getTime() - dur).toISOString();
    let q = "SELECT COUNT(*) total, SUM(CASE WHEN status='RESOLVIDO' THEN 1 ELSE 0 END) resolved FROM tickets WHERE organization_id=? AND created_at>=? AND created_at<?";
    const p = [orgId, prevFrom, from];
    if (branchId) { q += " AND branch_id=?"; p.push(branchId); }
    const row = db.prepare(q).get(...p);
    previous = { totalTickets: row.total || 0, resolved: row.resolved || 0 };
  }

  // Produtividade por responsável (top 8 técnicos no período).
  let agentQuery = `SELECT u.name, COUNT(t.id) total,
      SUM(CASE WHEN t.status='RESOLVIDO' THEN 1 ELSE 0 END) resolved
    FROM tickets t JOIN users u ON u.id=t.assignee_id WHERE t.organization_id=?`;
  const agentParams = [orgId];
  if (branchId) { agentQuery += " AND t.branch_id=?"; agentParams.push(branchId); }
  if (from) { agentQuery += " AND t.created_at>=?"; agentParams.push(from); }
  if (to) { agentQuery += " AND t.created_at<=?"; agentParams.push(to); }
  agentQuery += " GROUP BY u.id, u.name ORDER BY total DESC LIMIT 8";

  return Response.json({
    range: { from, to },
    trend,
    previous,
    byAgent: db.prepare(agentQuery).all(...agentParams),
    summary: {
      totalTickets: tickets.length,
      open: tickets.filter((t) => t.status !== "RESOLVIDO").length,
      resolved: resolved.length,
      mttrHours: Math.round(mttrHours * 10) / 10,
      firstResponseHours: Math.round(firstResponseHours * 10) / 10,
      firstResponseSlaPercent,
      slaViolations,
      csatAverage: csatAvg ? Math.round(csatAvg * 10) / 10 : null,
      firstContactResolution: resolved.length ? Math.round((resolved.filter((t) => !t.escalated_at).length / resolved.length) * 100) : 0,
    },
    byBranch: db.prepare(byBranchQuery).all(...byBranchParams),
    byPriority: ["CRITICA", "ALTA", "MEDIA", "BAIXA"].map((priority) => ({
      priority,
      count: tickets.filter((t) => t.priority === priority).length,
    })),
  });
}
