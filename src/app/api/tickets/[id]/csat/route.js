import { canAccessTicket, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional().default(""),
});

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Avaliação inválida." }, { status: 400 });
  const db = getDb();
  const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(id);
  if (!ticket) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });
  if (!canAccessTicket(auth.user, ticket)) return Response.json({ error: "Acesso negado." }, { status: 403 });
  if (ticket.status !== "RESOLVIDO") return Response.json({ error: "Avalie apenas chamados resolvidos." }, { status: 400 });
  db.prepare("UPDATE tickets SET csat_score=?, csat_comment=? WHERE id=?").run(parsed.data.score, parsed.data.comment || null, id);
  return Response.json({ ok: true });
}
