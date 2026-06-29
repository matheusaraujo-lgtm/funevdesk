import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { requireCurrentUser } from "@/lib/auth";
import { sanitizeFilename, validateUpload } from "@/lib/security";

const allowedTypes = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "video/mp4", "video/webm",
  "application/pdf", "text/plain",
]);
const maxSize = 10 * 1024 * 1024;

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const formData = await request.formData();
  const file = formData.get("arquivo");
  // Valida por magic bytes (não confia no Content-Type do cliente) e usa
  // a extensão canônica do tipo real — bloqueia upload de HTML/SVG disfarçado.
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
