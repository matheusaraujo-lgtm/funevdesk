import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ALL_PRINTER_EVENTS, resolvePrinterEvents } from "@/lib/printer-events";
import { z } from "zod";

export const dynamic = "force-dynamic";

const validKeys = ALL_PRINTER_EVENTS.map((event) => event.key);
const schema = z.object({ events: z.record(z.string(), z.boolean()) });

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const db = getDb();
  const row = db.prepare("SELECT printer_alert_events FROM system_settings WHERE organization_id=?").get(auth.user.organization_id);
  return Response.json({ events: resolvePrinterEvents(row?.printer_alert_events) });
}

export async function PUT(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!getPermissions(auth.user).canConfigure) {
    return Response.json({ error: "Apenas administradores podem configurar os alertas de impressora." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Configuração inválida." }, { status: 400 });
  const clean = {};
  for (const key of validKeys) {
    if (typeof parsed.data.events[key] === "boolean") clean[key] = parsed.data.events[key];
  }
  const db = getDb();
  db.prepare("UPDATE system_settings SET printer_alert_events=? WHERE organization_id=?").run(JSON.stringify(clean), auth.user.organization_id);
  return Response.json({ ok: true, events: resolvePrinterEvents(JSON.stringify(clean)) });
}
