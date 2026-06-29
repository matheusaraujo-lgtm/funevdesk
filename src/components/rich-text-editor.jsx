"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  Bold,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Paperclip,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildVideoEmbed, toEditorHtml, uploadRichTextFile } from "@/lib/rich-text";

const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,video/mp4,video/webm";

function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;");
}

function dataUrlToFile(dataUrl, fallbackName = "imagem-colada.png") {
  const match = String(dataUrl).match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match) return null;
  const mimeType = match[1];
  if (!mimeType.startsWith("image/")) return null;
  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const encoded = match[3] || "";
  const bytes = match[2] ? atob(encoded) : decodeURIComponent(encoded);
  const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) buffer[index] = bytes.charCodeAt(index);
  const name = fallbackName.includes(".") ? fallbackName : `${fallbackName}.${extension}`;
  return new File([buffer], name, { type: mimeType });
}

function collectPastedImageFiles(clipboardData) {
  const files = [];
  const seen = new Set();

  for (const file of Array.from(clipboardData?.files || [])) {
    if (!file.type.startsWith("image/")) continue;
    const key = `${file.name}-${file.type}-${file.size}`;
    if (!seen.has(key)) {
      seen.add(key);
      files.push(file);
    }
  }

  for (const item of Array.from(clipboardData?.items || [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) continue;
    const key = `${file.name}-${file.type}-${file.size}`;
    if (!seen.has(key)) {
      seen.add(key);
      files.push(file);
    }
  }

  const html = clipboardData?.getData("text/html") || "";
  const dataImages = html.match(/<img\b[^>]*\bsrc=["']data:image\/[^"']+["'][^>]*>/gi) || [];
  for (const tag of dataImages) {
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const alt = tag.match(/\balt=["']([^"']+)["']/i)?.[1] || "imagem-colada.png";
    const file = dataUrlToFile(src, alt);
    if (!file) continue;
    const key = `${file.name}-${file.type}-${file.size}`;
    if (!seen.has(key)) {
      seen.add(key);
      files.push(file);
    }
  }

  return files;
}

function ToolbarButton({ icon: Icon, label, onClick, disabled }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="size-4" />
    </Button>
  );
}

function syncEditorHtml(node, value, lastValueRef) {
  if (!node) return;
  const normalized = toEditorHtml(value || "");
  if (node.innerHTML === normalized) {
    lastValueRef.current = normalized;
    return;
  }
  node.innerHTML = normalized;
  lastValueRef.current = normalized;
}

export function RichTextEditor({
  value = "",
  onChange,
  readOnly = false,
  placeholder = "Escreva o conteúdo…",
  className,
  minHeight = "320px",
  allowImages = false,
  allowVideos = false,
  allowFiles = false,
  onKeyDown,
}) {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const lastValueRef = useRef("");
  const skipExternalSyncRef = useRef(false);
  const [uploading, setUploading] = useState(false);

  const emitChange = useCallback(() => {
    if (!editorRef.current || readOnly) return;
    const html = editorRef.current.innerHTML;
    skipExternalSyncRef.current = true;
    lastValueRef.current = html;
    onChange?.(html);
  }, [onChange, readOnly]);

  useLayoutEffect(() => {
    if (skipExternalSyncRef.current) {
      skipExternalSyncRef.current = false;
      return;
    }
    syncEditorHtml(editorRef.current, value, lastValueRef);
  }, [value, readOnly]);

  function exec(command, commandValue = null) {
    if (readOnly) return;
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  }

  function addLink() {
    if (readOnly) return;
    const url = window.prompt("URL do link:");
    if (!url) return;
    exec("createLink", url);
  }

  function insertUploadedMedia(file, publicUrl) {
    editorRef.current?.focus();
    if (file.type.startsWith("image/") && allowImages) {
      document.execCommand(
        "insertHTML",
        false,
        `<p><img src="${publicUrl}" alt="${escapeAttribute(file.name)}" class="rich-media-image" /></p>`,
      );
      return;
    }
    if ((file.type.startsWith("video/") || /\.(mp4|webm)$/i.test(file.name)) && allowVideos) {
      const embed = buildVideoEmbed(publicUrl);
      if (embed) {
        document.execCommand("insertHTML", false, embed);
        return;
      }
    }
    document.execCommand(
      "insertHTML",
      false,
      `<p><a href="${publicUrl}" class="rich-media-attachment" target="_blank" rel="noopener noreferrer">${escapeAttribute(file.name)}</a></p>`,
    );
  }

  async function uploadAndInsert(file) {
    if (!file || readOnly) return;
    setUploading(true);
    try {
      const publicUrl = await uploadRichTextFile(file);
      insertUploadedMedia(file, publicUrl);
      emitChange();
    } catch (error) {
      toast.error(error.message || "Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleVideoUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || readOnly) return;
    setUploading(true);
    try {
      const publicUrl = await uploadRichTextFile(file);
      const embed = buildVideoEmbed(publicUrl);
      if (!embed) throw new Error("Formato de vídeo não suportado.");
      editorRef.current?.focus();
      document.execCommand("insertHTML", false, embed);
      emitChange();
    } catch (error) {
      toast.error(error.message || "Não foi possível enviar o vídeo.");
    } finally {
      setUploading(false);
    }
  }

  function insertVideoUrl() {
    if (readOnly) return;
    const url = window.prompt("Cole a URL do vídeo (YouTube, Vimeo ou arquivo .mp4/.webm):");
    if (!url) return;
    const embed = buildVideoEmbed(url);
    if (!embed) return toast.error("URL de vídeo não suportada.");
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, embed);
    emitChange();
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await uploadAndInsert(file);
  }

  async function handleAttachmentUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await uploadAndInsert(file);
  }

  async function handlePaste(event) {
    if (readOnly || (!allowImages && !allowFiles)) return;
    const pastedImageFiles = allowImages ? collectPastedImageFiles(event.clipboardData) : [];
    if (pastedImageFiles.length > 0) {
      event.preventDefault();
      for (const file of pastedImageFiles) await uploadAndInsert(file);
      return;
    }

    const html = event.clipboardData?.getData("text/html") || "";
    if (allowImages && /<img\b/i.test(html)) {
      event.preventDefault();
      toast.error("Não foi possível ler essa imagem da área de transferência. Use o botão de imagem/anexo para enviar o arquivo.");
    }
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-background", className)}>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1.5">
          <ToolbarButton icon={Bold} label="Negrito" onClick={() => exec("bold")} disabled={uploading} />
          <ToolbarButton icon={Italic} label="Itálico" onClick={() => exec("italic")} disabled={uploading} />
          <ToolbarButton icon={Underline} label="Sublinhado" onClick={() => exec("underline")} disabled={uploading} />
          <ToolbarButton icon={Strikethrough} label="Tachado" onClick={() => exec("strikeThrough")} disabled={uploading} />
          <ToolbarButton icon={Heading2} label="Título" onClick={() => exec("formatBlock", "h2")} disabled={uploading} />
          <ToolbarButton icon={List} label="Lista" onClick={() => exec("insertUnorderedList")} disabled={uploading} />
          <ToolbarButton icon={ListOrdered} label="Lista numerada" onClick={() => exec("insertOrderedList")} disabled={uploading} />
          <ToolbarButton icon={Link2} label="Link" onClick={addLink} disabled={uploading} />
          {allowImages && (
            <>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleImageUpload} />
              <ToolbarButton icon={ImagePlus} label="Inserir imagem" onClick={() => fileInputRef.current?.click()} disabled={uploading} />
            </>
          )}
          {allowFiles && (
            <>
              <input ref={attachmentInputRef} type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handleAttachmentUpload} />
              <ToolbarButton icon={Paperclip} label="Anexar arquivo" onClick={() => attachmentInputRef.current?.click()} disabled={uploading} />
            </>
          )}
          {allowVideos && (
            <>
              <input ref={videoInputRef} type="file" accept="video/mp4,video/webm" className="hidden" onChange={handleVideoUpload} />
              <ToolbarButton icon={Video} label="Inserir vídeo (URL)" onClick={insertVideoUrl} disabled={uploading} />
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={uploading} onClick={() => videoInputRef.current?.click()}>
                Enviar MP4
              </Button>
            </>
          )}
          <ToolbarButton icon={Undo2} label="Desfazer" onClick={() => exec("undo")} disabled={uploading} />
          <ToolbarButton icon={Redo2} label="Refazer" onClick={() => exec("redo")} disabled={uploading} />
        </div>
      )}
      <div
        ref={editorRef}
        className={cn(
          "rich-text-content px-4 py-3 text-sm leading-7 text-foreground outline-none",
          readOnly ? "min-h-[120px] bg-muted/10" : "min-h-[320px]",
        )}
        style={readOnly ? undefined : { minHeight }}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emitChange}
        onBlur={emitChange}
        onPaste={handlePaste}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
