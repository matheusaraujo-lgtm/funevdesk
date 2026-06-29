import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

/* ------------------------------------------------------------------ *
 * Rate limiting (in-memory, por instância)
 * Para produção multi-instância, trocar por Redis. Suficiente para
 * mitigar brute force/credential stuffing em deploy único.
 * ------------------------------------------------------------------ */
const buckets = new Map();

export function rateLimit(key, { limit = 10, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }
  return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 };
}

// Limpeza periódica para evitar crescimento ilimitado do Map.
if (typeof setInterval === "function") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) if (entry.resetAt <= now) buckets.delete(key);
  }, 5 * 60_000);
  if (timer.unref) timer.unref();
}

export function clientIp(request) {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export function tooManyRequests(retryAfterMs) {
  return Response.json(
    { error: "Muitas tentativas. Aguarde alguns instantes e tente novamente." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
  );
}

/* ------------------------------------------------------------------ *
 * Validação de host / anti argument-injection (monitor de rede)
 * Mantém suporte a IPs/hosts internos (LAN) — apenas rejeita valores
 * que não são host válido (ex.: começando com "-", metacaracteres).
 * ------------------------------------------------------------------ */
const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?:\.(?!-)[A-Za-z0-9-]{1,63})*\.?$/;

export function isValidHost(value) {
  if (typeof value !== "string") return false;
  const host = value.trim();
  if (!host || host.length > 253 || host.startsWith("-")) return false;
  if (net.isIP(host)) return true;
  return HOSTNAME_RE.test(host);
}

/* ------------------------------------------------------------------ *
 * Guarda anti-SSRF (webhooks e demais requisições de saída)
 * Resolve o host e bloqueia faixas privadas/loopback/link-local para
 * impedir acesso a metadados de nuvem (169.254.169.254) e rede interna.
 * Override por org on-prem: env WEBHOOK_ALLOW_PRIVATE=true.
 * ------------------------------------------------------------------ */
function isPrivateIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local + metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] >= 224) return true; // multicast/reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7)); // IPv4-mapeado
    return false;
  }
  return true; // não é IP → trate como inseguro
}

export async function assertSafeOutboundUrl(rawUrl, { allowPrivate = false } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL inválida.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Apenas http(s) é permitido.");
  }
  if (allowPrivate || process.env.WEBHOOK_ALLOW_PRIVATE === "true") {
    return { url, address: null };
  }
  let addresses;
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new Error("Não foi possível resolver o destino.");
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error("Destino aponta para rede interna/privada — bloqueado por segurança.");
    }
  }
  return { url, address: addresses[0]?.address || null };
}

/* ------------------------------------------------------------------ *
 * Nome de arquivo seguro (Content-Disposition / armazenamento)
 * ------------------------------------------------------------------ */
export function sanitizeFilename(name, fallback = "arquivo") {
  const base = String(name || "").split(/[\\/]/).pop() || fallback;
  const clean = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120);
  return clean || fallback;
}

/* ------------------------------------------------------------------ *
 * Validação de upload por magic bytes — não confiar no Content-Type
 * declarado pelo cliente. Retorna a extensão canônica do tipo real.
 * ------------------------------------------------------------------ */
const MIME_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
};

function matchesMagic(bytes, mime) {
  const b = bytes;
  switch (mime) {
    case "image/png":
      return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    case "image/jpeg":
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/gif":
      return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46; // GIF
    case "image/webp":
      return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
        && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50; // RIFF....WEBP
    case "application/pdf":
      return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
    case "video/mp4":
      return b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; // ....ftyp
    case "video/webm":
      return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3; // EBML
    case "text/plain":
      return true; // validado pelo allow-list de tipo; servido com nosniff
    default:
      return false;
  }
}

/**
 * Valida um File de upload. Retorna { ok, ext, mime } ou { ok:false, error }.
 * @param {File} file
 * @param {{ allowed: Set<string>, maxSize: number }} opts
 */
export async function validateUpload(file, { allowed, maxSize }) {
  if (!(file instanceof File)) return { ok: false, error: "Nenhum arquivo foi enviado.", status: 400 };
  const declared = file.type;
  if (!allowed.has(declared)) return { ok: false, error: "Formato não permitido.", status: 415 };
  if (file.size > maxSize) return { ok: false, error: "Arquivo acima do tamanho máximo.", status: 413 };
  const head = Buffer.from(await file.slice(0, 16).arrayBuffer());
  if (!matchesMagic(head, declared)) {
    return { ok: false, error: "O conteúdo do arquivo não corresponde ao tipo informado.", status: 415 };
  }
  return { ok: true, ext: MIME_EXT[declared] || ".bin", mime: declared };
}

/* ------------------------------------------------------------------ *
 * Hash de token (para armazenar credenciais de agente em repouso)
 * ------------------------------------------------------------------ */
export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/* RFC 4515 — escape de valores em filtros LDAP */
export function escapeLdapFilterValue(value) {
  return String(value).replace(/[\\*()\0]/g, (ch) => {
    switch (ch) {
      case "\\": return "\\5c";
      case "*": return "\\2a";
      case "(": return "\\28";
      case ")": return "\\29";
      case "\0": return "\\00";
      default: return ch;
    }
  });
}
