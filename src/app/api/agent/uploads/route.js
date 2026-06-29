import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { findAssetByToken } from "@/lib/agent";
import { getDb } from "@/lib/db";
import { clientIp, rateLimit, sanitizeFilename, tooManyRequests, validateUpload } from "@/lib/security";

const allowedTypes = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf", "text/plain",
]);
const maxSize = 10 * 1024 * 1024;

export const dynamic = "force-dynamic";

export async function POST(request) {
  const token = request.headers.get("x-agent-token")?.trim();
  if (!token) return Response.json({ error: "Token do agente ausente." }, { status: 401 });

  const db = getDb();
  const asset = findAssetByToken(db, token);
  if (!asset) return Response.json({ error: "Agente não autorizado." }, { status: 401 });

  // Limita volume de uploads por agente.
  const limit = rateLimit(`agent-upload:${asset.id}:${clientIp(request)}`, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

  const formData = await request.formData();
  const file = formData.get("arquivo");
  const check = await validateUpload(file, { allowed: allowedTypes, maxSize });
  if (!check.ok) return Response.json({ error: check.error }, { status: check.status });

  const storedName = `${crypto.randomUUID()}${check.ext}`;
  const directory = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, storedName), Buffer.from(await file.arrayBuffer()));

  return Response.json({
    originalName: sanitizeFilename(file.name),
    storedName,
    mimeType: check.mime,
    sizeBytes: file.size,
    publicUrl: `/uploads/${storedName}`,
  }, { status: 201 });
}
