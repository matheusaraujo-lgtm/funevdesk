const HTML_TAG = /<\/?(?:p|div|h[1-6]|ul|ol|li|br|blockquote|strong|em|u|a|span|img|video|iframe|source)[^>]*>/i;

export function isHtmlContent(value) {
  if (!value) return false;
  return HTML_TAG.test(value);
}

export function plainTextPreview(value, maxLength = 120) {
  if (!value) return "";
  const text = isHtmlContent(value)
    ? value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : value.replace(/\s+/g, " ").trim();
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
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  if (url.startsWith("/uploads/")) return true;
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
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|\/uploads\/|#)/i,
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
      node.classList.add(tag === "img" ? "rich-media-image" : "rich-media-video-file");
    }
    if (tag === "source") {
      if (!isSafeMediaUrl(node.getAttribute("src"))) node.remove();
    }
    if (tag === "iframe") {
      if (!isSafeEmbedUrl(node.getAttribute("src"))) {
        node.remove();
        return;
      }
    }
    if (tag === "a") {
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
  return result.publicUrl;
}
