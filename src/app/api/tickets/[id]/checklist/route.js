import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  checklist: z.array(z.object({
    id: z.string().min(1).max(60),
    label: z.string().min(1).max(200),
    checked: z.boolean(),
  })).max(50),
});

export async function PUT(request, { params }) {
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Checklist inválido." }, { status: 400 });
  const db = getDb();
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!getPermissions(currentUser).canManageTickets) {
    return Response.json({ error: "Apenas a equipe de suporte pode salvar o checklist." }, { status: 403 });
  }
  const ticket = db.prepare("SELECT id, organization_id, branch_id FROM tickets WHERE id=?").get(id);
  if (!ticket || ticket.organization_id !== currentUser.organization_id) {
    return Response.json({ error: "Chamado não encontrado." }, { status: 404 });
  }
  // Técnico sem visão global só salva em chamados das suas unidades.
  if (!getPermissions(currentUser).canViewAllBranches && !currentUser.branchIds?.includes(ticket.branch_id)) {
    return Response.json({ error: "Você não tem acesso a este chamado." }, { status: 403 });
  }
  db.prepare("UPDATE tickets SET checklist_json=? WHERE id=?").run(JSON.stringify(parsed.data.checklist), id);
  return Response.json({ ok: true });
}
