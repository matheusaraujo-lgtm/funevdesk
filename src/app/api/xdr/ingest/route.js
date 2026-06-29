import crypto from "node:crypto";
import { z } from "zod";
import { getDb, makeId } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/security";
import { normalizeAlert, SEVERITIES } from "@/lib/xdr-connectors";

export const dynamic = "force-dynamic";

/**
 * Ingestão XDR provider-agnóstica.
 *
 * Endpoint POST para sistemas externos (Defender, SentinelOne, SOAR, etc.)
 * empurrarem (push) alertas. Autenticação por segredo de servidor compartilhado
 * no header `x-xdr-secret`, comparado em tempo constante a XDR_INGEST_SECRET.
 *
 * Sem XDR_INGEST_SECRET definido → 503 (ingestão não configurada). Não criamos
 * dados falsos: cada alerta vem do corpo da requisição validado por zod.
 */

const alertSchema = z.object({
  externalId: z.string().min(1),
  severity: z.enum(SEVERITIES),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  hostname: z.string().max(253).optional(),
  detectedAt: z.string().max(64).optional(),
});

const ingestSchema = z.object({
  organizationSlug: z.string().min(1).max(120),
  provider: z.string().min(1).max(60),
  alerts: z.array(alertSchema).min(1).max(500),
});

/** Comparação de segredo em tempo constante (resistente a timing attack). */
function secretMatches(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual exige tamanhos iguais
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  const expectedSecret = process.env.XDR_INGEST_SECRET;
  if (!expectedSecret) {
    return Response.json({ error: "Ingestão XDR não configurada." }, { status: 503 });
  }

  // Rate limiting por IP para mitigar abuso/força bruta do segredo.
  const limit = rateLimit(`xdr-ingest:${clientIp(request)}`, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

  const provided = request.headers.get("x-xdr-secret") || "";
  if (!secretMatches(provided, expectedSecret)) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Dados de ingestão inválidos." }, { status: 400 });
  }
  const { organizationSlug, provider, alerts } = parsed.data;

  const db = getDb();
  const organization = db
    .prepare("SELECT id FROM organizations WHERE slug=?")
    .get(organizationSlug);
  if (!organization) {
    return Response.json({ error: "Organização não encontrada." }, { status: 404 });
  }

  const providerKey = provider.toUpperCase();
  const now = new Date().toISOString();

  // UPSERT por (provider, external_id), conforme a restrição UNIQUE da tabela.
  // Não sobrescrevemos status (preserva triagem) nem created_at; atualizamos o
  // conteúdo do alerta e o vínculo de ativo.
  const upsert = db.prepare(`
    INSERT INTO xdr_alerts
      (id, organization_id, asset_id, provider, external_id, severity, title, description, status, raw_json, detected_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?)
    ON CONFLICT(organization_id, provider, external_id) DO UPDATE SET
      asset_id=excluded.asset_id,
      severity=excluded.severity,
      title=excluded.title,
      description=excluded.description,
      raw_json=excluded.raw_json,
      detected_at=excluded.detected_at
  `);

  // Vincula asset_id pelo hostname dentro da MESMA organização (escopo de org).
  const findAsset = db.prepare(
    "SELECT id FROM assets WHERE organization_id=? AND hostname=? LIMIT 1",
  );

  const ingest = db.transaction((rows) => {
    let count = 0;
    for (const alert of rows) {
      // Reaproveita a normalização para garantir formato/severidade consistentes.
      const normalized = normalizeAlert(
        {
          externalId: alert.externalId,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          hostname: alert.hostname,
          detectedAt: alert.detectedAt,
        },
        providerKey,
      );
      const assetId = normalized.hostname
        ? findAsset.get(organization.id, normalized.hostname)?.id || null
        : null;
      upsert.run(
        makeId("xdr"),
        organization.id,
        assetId,
        providerKey,
        normalized.externalId,
        normalized.severity,
        normalized.title,
        normalized.description,
        JSON.stringify(normalized.raw),
        normalized.detectedAt,
        now,
      );
      count += 1;
    }
    return count;
  });

  const ingested = ingest(alerts);
  return Response.json({ ok: true, provider: providerKey, ingested });
}
