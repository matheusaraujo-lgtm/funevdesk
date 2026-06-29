import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { plainTextFromHtml } from "@/lib/rich-text";

const A4 = { width: 595.28, height: 841.89 };

function safeDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return String(value);
  }
}

function resolveFieldValue(term, field) {
  switch (field) {
    case "title":
      return term.title || term.template_title || "TERMO DE USO DE EQUIPAMENTO";
    case "branch_name":
      return term.branch_name || "";
    case "hostname":
      return term.hostname || "";
    case "equipment_type":
      return term.equipment_type || term.asset_type || "";
    case "patrimony_number":
      return term.patrimony_number || "Não informado";
    case "signer_name":
      return term.signer_name || "";
    case "signer_document":
      return term.signer_document || "Não informado";
    case "body":
      return plainTextFromHtml(term.body_html || term.body_text || term.template_body || "");
    case "signature_text":
      return term.signature_text || "(aguardando assinatura)";
    case "signed_at":
      return term.signed_at ? safeDate(term.signed_at) : "(pendente)";
    case "date":
      return safeDate(term.created_at);
    default:
      return "";
  }
}

function sanitizeForWinAnsi(text) {
  return String(text ?? "").replace(/[^\x00-\xFF]/g, "?");
}

function wrapText(font, text, fontSize, maxWidth) {
  const lines = [];
  const paragraphs = String(text ?? "").split(/\r?\n/);
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(sanitizeForWinAnsi(candidate), fontSize);
      if (width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function readPublicAsset(src) {
  if (!src || typeof src !== "string") return null;
  let relative = src;
  if (relative.startsWith("http")) {
    try {
      relative = new URL(relative).pathname;
    } catch {
      return null;
    }
  }
  relative = relative.replace(/^\/+/, "");
  if (relative.startsWith("api/")) return null;
  const full = path.join(process.cwd(), "public", relative);
  const normalized = path.normalize(full);
  const root = path.normalize(path.join(process.cwd(), "public"));
  if (!normalized.startsWith(root)) return null;
  try {
    if (!fs.existsSync(normalized)) return null;
    return { bytes: fs.readFileSync(normalized), ext: path.extname(normalized).toLowerCase() };
  } catch {
    return null;
  }
}

async function buildLayoutPdf(term, layout) {
  const doc = await PDFDocument.create();
  const pageWidth = Number(layout.page?.width) || A4.width;
  const pageHeight = Number(layout.page?.height) || A4.height;
  const page = doc.addPage([pageWidth, pageHeight]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const elements = Array.isArray(layout.elements) ? layout.elements : [];
  for (const element of elements) {
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const w = Number(element.w) || 100;
    const h = Number(element.h) || 20;
    const topY = pageHeight - y;

    if (element.type === "image") {
      const asset = readPublicAsset(element.src);
      if (!asset) continue;
      try {
        const embedded = asset.ext === ".png"
          ? await doc.embedPng(asset.bytes)
          : await doc.embedJpg(asset.bytes);
        page.drawImage(embedded, { x, y: topY - h, width: w, height: h });
      } catch {
        /* skip unsupported image */
      }
      continue;
    }

    const fontSize = Number(element.fontSize) || 12;
    const useBold = Boolean(element.bold);
    const activeFont = useBold ? fontBold : font;
    const color = element.color || "#111111";
    const rgbColor = hexToRgb(color);

    let text;
    if (element.type === "field") {
      const label = element.label ? `${element.label} ` : "";
      text = `${label}${resolveFieldValue(term, element.field)}`;
    } else if (element.type === "signature") {
      const name = resolveFieldValue(term, "signature_text");
      const when = resolveFieldValue(term, "signed_at");
      text = `${name}\n${element.label || "Assinatura"} - ${when}`;
    } else {
      text = element.text || "";
    }

    const lineHeight = fontSize * 1.3;
    const lines = wrapText(activeFont, text, fontSize, w);
    let cursorY = topY - fontSize;
    for (const line of lines) {
      if (cursorY < pageHeight - y - h - lineHeight) break;
      let drawX = x;
      if (element.align === "center") {
        const lineWidth = activeFont.widthOfTextAtSize(sanitizeForWinAnsi(line), fontSize);
        drawX = x + Math.max(0, (w - lineWidth) / 2);
      } else if (element.align === "right") {
        const lineWidth = activeFont.widthOfTextAtSize(sanitizeForWinAnsi(line), fontSize);
        drawX = x + Math.max(0, w - lineWidth);
      }
      page.drawText(sanitizeForWinAnsi(line), {
        x: drawX,
        y: cursorY,
        size: fontSize,
        font: activeFont,
        color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
      });
      cursorY -= lineHeight;
    }

    if (element.type === "signature") {
      page.drawLine({
        start: { x, y: topY - 4 },
        end: { x: x + w, y: topY - 4 },
        thickness: 0.7,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function hexToRgb(hex) {
  const value = String(hex || "#111111").replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 0.07, g: 0.07, b: 0.07 };
  return { r: ((num >> 16) & 255) / 255, g: ((num >> 8) & 255) / 255, b: (num & 255) / 255 };
}

async function buildDefaultPdf(term) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.width, A4.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  const maxWidth = A4.width - margin * 2;
  let cursorY = A4.height - margin;

  const drawBlock = (text, { size = 12, bold = false, gap = 6 } = {}) => {
    const activeFont = bold ? fontBold : font;
    const lines = wrapText(activeFont, text, size, maxWidth);
    for (const line of lines) {
      page.drawText(sanitizeForWinAnsi(line), { x: margin, y: cursorY, size, font: activeFont, color: rgb(0.07, 0.07, 0.07) });
      cursorY -= size * 1.35;
    }
    cursorY -= gap;
  };

  drawBlock(resolveFieldValue(term, "title"), { size: 16, bold: true, gap: 14 });
  drawBlock(`Unidade: ${resolveFieldValue(term, "branch_name")}`);
  drawBlock(`Equipamento: ${resolveFieldValue(term, "hostname")}`);
  drawBlock(`Tipo: ${resolveFieldValue(term, "equipment_type")}`);
  drawBlock(`Patrimonio: ${resolveFieldValue(term, "patrimony_number")}`);
  drawBlock(`Usuario responsavel: ${resolveFieldValue(term, "signer_name")}`);
  drawBlock(`Documento: ${resolveFieldValue(term, "signer_document")}`, { gap: 14 });
  drawBlock(resolveFieldValue(term, "body") || "Declaro que recebi o equipamento acima, comprometendo-me a zelar pelo uso adequado.", { gap: 24 });
  drawBlock(`Assinatura registrada: ${resolveFieldValue(term, "signature_text")}`, { bold: true });
  drawBlock(`Data/hora: ${term.signed_at ? safeDate(term.signed_at) : safeDate(term.created_at)}`);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export async function buildTermPdf(term) {
  let layout = null;
  if (term.layout_json) {
    try {
      const parsed = typeof term.layout_json === "string" ? JSON.parse(term.layout_json) : term.layout_json;
      if (parsed && Array.isArray(parsed.elements) && parsed.elements.length) layout = parsed;
    } catch {
      layout = null;
    }
  }
  if (layout) return buildLayoutPdf(term, layout);
  return buildDefaultPdf(term);
}
