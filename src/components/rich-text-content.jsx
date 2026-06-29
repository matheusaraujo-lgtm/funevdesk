"use client";

import { cn } from "@/lib/utils";
import { isHtmlContent, sanitizeHtml, toEditorHtml } from "@/lib/rich-text";

export function RichTextContent({ value, className }) {
  if (!value) return null;

  if (isHtmlContent(value)) {
    return (
      <div
        className={cn("rich-text-content text-sm leading-7 text-foreground", className)}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
      />
    );
  }

  return <div className={cn("rich-text-content whitespace-pre-wrap text-sm leading-7 text-foreground", className)}>{value}</div>;
}

export function RichTextPreview({ value, className }) {
  return <RichTextContent value={toEditorHtml(value)} className={className} />;
}
