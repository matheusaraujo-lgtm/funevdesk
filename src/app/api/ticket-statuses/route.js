import { can, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listTicketStatuses } from "@/lib/ticket-statuses";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const db = getDb();
  return Response.json({ statuses: listTicketStatuses(db, auth.user.organization_id) });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "statuses", "create")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const body = await request.json();
  const code = String(body.code || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
  const label = String(body.label || "").trim();
  if (code.length < 2 || label.length < 2) {
    return Response.json({ error: "Código e nome são obrigatórios." }, { status: 400 });
  }
  const db = getDb();
  const exists = db.prepare("SELECT id FROM ticket_statuses WHERE organization_id=? AND code=?").get(auth.user.organization_id, code);
  if (exists) return Response.json({ error: "Já existe um status com este código." }, { status: 409 });

  const { makeId } = await import("@/lib/db");
  const now = new Date().toISOString();
  // Novas situações entram antes de Cancelado/Resolvido — essas duas continuam por último
  // (Resolvido no fim, Cancelado logo antes), então empurramos as duas (e o que vier depois) uma posição.
  const terminalOrder = db.prepare(
    "SELECT MIN(sort_order) minOrder FROM ticket_statuses WHERE organization_id=? AND code IN ('CANCELADO','RESOLVIDO')"
  ).get(auth.user.organization_id).minOrder;
  let sort;
  if (terminalOrder != null) {
    sort = terminalOrder;
    db.prepare("UPDATE ticket_statuses SET sort_order = sort_order + 1 WHERE organization_id=? AND sort_order >= ?").run(auth.user.organization_id, sort);
  } else {
    sort = db.prepare("SELECT COALESCE(MAX(sort_order), -1)+1 AS next FROM ticket_statuses WHERE organization_id=?").get(auth.user.organization_id).next;
  }
  db.prepare(`
    INSERT INTO ticket_statuses (id, organization_id, code, label, sort_order, is_terminal, pauses_sla, allows_messages, requires_reason, color, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    makeId("sts"),
    auth.user.organization_id,
    code,
    label,
    sort,
    body.isTerminal ? 1 : 0,
    body.pausesSla ? 1 : 0,
    body.allowsMessages === false ? 0 : 1,
    body.requiresReason ? 1 : 0,
    body.color || "blue",
    now,
  );
  return Response.json({ statuses: listTicketStatuses(db, auth.user.organization_id) }, { status: 201 });
}
