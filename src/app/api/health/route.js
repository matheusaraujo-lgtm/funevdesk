import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Health check para monitoramento externo (systemd, uptime monitor, load balancer).
// Sem autenticação de propósito — mas também sem NENHUM dado do sistema: só confirma
// que o processo responde e que o banco aceita uma query trivial.
export async function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    return Response.json({ ok: true, db: "ok" });
  } catch {
    return Response.json({ ok: false, db: "error" }, { status: 503 });
  }
}
