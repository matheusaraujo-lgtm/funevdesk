import { requireCurrentUser } from "@/lib/auth";
import { listUnread, markAllRead, markRead } from "@/lib/notifications";
import { getDb } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().min(1).max(64).optional(),
});

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  return Response.json({ notifications: listUnread(getDb(), auth.user.id) });
}

export async function PATCH(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  if (parsed.data.id) {
    markRead(db, auth.user.id, parsed.data.id);
  } else {
    markAllRead(db, auth.user.id);
  }
  return Response.json({ ok: true });
}
