const HTML_TAG = /<\/?(?:p|div|h[1-6]|ul|ol|li|br|blockquote|strong|em|u|a|span|img|video|iframe|source)[^>]*>/i;
// Entidades HTML (&nbsp;, &amp;, &#39;, &#x27;...). Conteúdo do editor pode vir só com
// entidade e sem tag (ex.: espaço final vira &nbsp;); sem detectar isso, era exibido cru.
const HTML_ENTITY = /&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i;

export function isHtmlContent(value) {
  if (!value) return false;
  return HTML_TAG.test(value) || HTML_ENTITY.test(value);
}

// Entidades nomeadas mais comuns (o editor + DOMPurify geram sobretudo &amp; &lt; &gt; &quot;
// &#39; &nbsp;; conteúdo colado pode trazer entidades acentuadas). Sem decodificar isto, a
// notificação/preview exibia "Servi&ccedil;o", "Rua A &amp; B", "palavra&nbsp;palavra" cru.
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  agrave: "à", Agrave: "À", atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ",
  acirc: "â", ecirc: "ê", ocirc: "ô", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô",
  ccedil: "ç", Ccedil: "Ç", ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
  ordf: "ª", ordm: "º", deg: "°", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

export function decodeHtmlEntities(text) {
  if (!text || text.indexOf("&") === -1) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X"
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      if (Number.isNaN(code) || code < 0 || code > 0x10FFFF) return match;
      try { return String.fromCodePoint(code); } catch { return match; }
    }
    const named = NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()];
    return named !== undefined ? named : match;
  });
}

export function plainTextPreview(value, maxLength = 120) {
  if (!value) return "";
  const stripped = isHtmlContent(value) ? value.replace(/<[^>]+>/g, " ") : value;
  const text = decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function isRichTextEmpty(value) {
  if (!value) return true;
  if (/<(?:img|video|iframe)\b/i.test(value)) return false;
  if (/<a\b[^>]*class=["'][^"']*rich-media-attachment/i.test(value)) return false;
  return !plainTextPreview(value, 100000).trim();
}

export function plainTextFromHtml(value) {
  if (!value) return "";
  if (!isHtmlContent(value)) return value;
  return decodeHtmlEntities(value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

export function toEditorHtml(value) {
  if (!value) return "";
  if (isHtmlContent(value)) return value;
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isSafeMediaUrl(url) {
  if (!url) return false;
  if (url.startsWith("/uploads/") || url.startsWith("/api/uploads/")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isSafeEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    return (
      host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be"
      || host === "player.vimeo.com" || host === "vimeo.com"
    ) && (parsed.protocol === "https:" || parsed.protocol === "http:");
  } catch {
    return false;
  }
}

export function buildVideoEmbed(inputUrl) {
  const url = String(inputUrl || "").trim();
  if (!url) return "";

  const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (youtubeMatch) {
    const embedUrl = `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    return `<div class="rich-media rich-media-video" contenteditable="false"><iframe src="${embedUrl}" title="Vídeo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div><p><br></p>`;
  }

  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeoMatch) {
    const embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    return `<div class="rich-media rich-media-video" contenteditable="false"><iframe src="${embedUrl}" title="Vídeo" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div><p><br></p>`;
  }

  if (isSafeMediaUrl(url) && /\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
    return `<div class="rich-media rich-media-video" contenteditable="false"><video controls preload="metadata" src="${url}"></video></div><p><br></p>`;
  }

  return "";
}

import DOMPurify from "isomorphic-dompurify";

// Allow-list based sanitization (DOMPurify). Substitui o antigo blocklist por regex,
// que era contornável (ex.: handlers sem aspas, <scr<script>ipt>, entidades em javascript:).
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "p", "div", "span", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "blockquote", "pre", "code",
    "strong", "b", "em", "i", "u", "s", "mark", "sub", "sup",
    "a", "img", "video", "source", "iframe",
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  ALLOWED_ATTR: [
    "href", "src", "alt", "title", "class", "target", "rel",
    "controls", "preload", "allow", "allowfullscreen", "loading",
    "colspan", "rowspan", "width", "height",
  ],
  // Bloqueia esquemas perigosos (javascript:, data: exceto imagem) e mantém apenas seguros.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|\/uploads\/|\/api\/uploads\/|#)/i,
  FORBID_TAGS: ["script", "style", "form", "input", "button", "object", "embed", "link", "meta"],
  FORBID_ATTR: ["style"],
  ADD_ATTR: ["target"],
};

let hooksRegistered = false;
function registerHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const tag = node.tagName?.toLowerCase();
    if (tag === "img" || tag === "video") {
      const src = node.getAttribute("src");
      if (!isSafeMediaUrl(src)) {
        node.remove();
        return;
      }
      // Conteúdo salvo antes da rota /api/uploads existir ainda referencia o link estático
      // quebrado (/uploads/<uuid>) — reescreve para a rota autenticada sem precisar de migração.
      if (src.startsWith("/uploads/")) node.setAttribute("src", src.replace("/uploads/", "/api/uploads/"));
      node.classList.add(tag === "img" ? "rich-media-image" : "rich-media-video-file");
    }
    if (tag === "source") {
      const src = node.getAttribute("src");
      if (!isSafeMediaUrl(src)) {
        node.remove();
      } else if (src.startsWith("/uploads/")) {
        node.setAttribute("src", src.replace("/uploads/", "/api/uploads/"));
      }
    }
    if (tag === "iframe") {
      if (!isSafeEmbedUrl(node.getAttribute("src"))) {
        node.remove();
        return;
      }
    }
    if (tag === "a") {
      const href = node.getAttribute("href");
      if (href && href.startsWith("/uploads/")) node.setAttribute("href", href.replace("/uploads/", "/api/uploads/"));
      node.setAttribute("rel", "noopener noreferrer nofollow");
      if (node.getAttribute("target")) node.setAttribute("target", "_blank");
    }
  });
}

export function sanitizeHtml(value) {
  if (!value) return "";
  registerHooks();
  const html = isHtmlContent(value) ? value : toEditorHtml(value);
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

export async function uploadRichTextFile(file) {
  const formData = new FormData();
  formData.append("arquivo", file);
  const response = await fetch("/api/uploads", { method: "POST", body: formData });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Falha no upload.");
  // O editor insere esta URL direto no DOM para pré-visualização imediata (antes de salvar),
  // então já precisa ser a rota autenticada — o link estático /uploads/<uuid> daria 404 em
  // produção (ver src/app/api/uploads/[...slug]/route.js).
  const publicUrl = result.publicUrl || "";
  return publicUrl.startsWith("/uploads/") ? publicUrl.replace("/uploads/", "/api/uploads/") : publicUrl;
}
