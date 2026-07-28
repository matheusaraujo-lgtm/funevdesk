// Resolve a URL servível de um anexo. Anexos persistidos têm `id` → sempre pela rota
// autenticada e escopada por organização /api/attachments/<id>. Isso é OBRIGATÓRIO porque,
// com `output: "standalone"` do Next, arquivos gravados em runtime em public/uploads
// devolvem 404 quando acessados como /uploads/<arquivo>. Uploads recém-feitos (ainda sem
// id, antes de salvar o chamado) caem no publicUrl temporário só para pré-visualização.
export function attachmentUrl(attachment) {
  if (!attachment) return "";
  if (attachment.id) return `/api/attachments/${attachment.id}`;
  return attachment.publicUrl || attachment.public_url || "";
}

export function attachmentName(attachment) {
  return attachment?.originalName || attachment?.original_name || attachment?.value_text || "arquivo";
}

export function attachmentMime(attachment) {
  return attachment?.mimeType || attachment?.mime_type || "";
}

// Classifica o anexo para escolher o visualizador (imagem, vídeo, PDF ou genérico).
export function attachmentKind(attachment) {
  const mime = attachmentMime(attachment);
  const name = attachmentName(attachment);
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|webm|mov|ogg)$/i.test(name)) return "video";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (mime.startsWith("text/") || /\.(txt|log|csv|json)$/i.test(name)) return "text";
  return "other";
}
