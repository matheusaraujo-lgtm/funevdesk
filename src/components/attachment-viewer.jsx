"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { attachmentKind, attachmentName, attachmentUrl } from "@/lib/attachments";
import { cn } from "@/lib/utils";

// Visualizador de anexos em modal: abre imagens, vídeos, PDFs e texto direto na tela,
// sem depender de nova aba (que dava 404 no /uploads sob "standalone"). Serve tudo pela
// rota autenticada /api/attachments/<id>. Quando há vários anexos, navega entre eles.
export function AttachmentViewer({ attachments = [], open, onOpenChange, initialIndex = 0 }) {
  const items = attachments.filter(Boolean);
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(Math.min(initialIndex, Math.max(0, items.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialIndex]);

  if (!items.length) return null;
  const safeIndex = Math.min(index, items.length - 1);
  const current = items[safeIndex];
  const url = attachmentUrl(current);
  const name = attachmentName(current);
  const kind = attachmentKind(current);
  const hasMany = items.length > 1;

  function go(delta) {
    setIndex((value) => (value + delta + items.length) % items.length);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <DialogTitle className="truncate text-sm font-semibold">{name}</DialogTitle>
            {hasMany && <p className="text-xs text-muted-foreground">{safeIndex + 1} de {items.length}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pr-6">
            <Button render={<a href={url} download={name} />} variant="outline" size="sm" className="h-8">
              <Download className="size-3.5" /> Baixar
            </Button>
            <Button render={<a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir em nova aba" />} variant="ghost" size="icon" className="size-8">
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="relative flex min-h-[320px] flex-1 items-center justify-center overflow-auto bg-muted/30 p-4">
          {kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={name} className="mx-auto max-h-[70vh] max-w-full rounded-lg object-contain" />
          )}
          {kind === "video" && (
            <video src={url} controls className="mx-auto max-h-[70vh] max-w-full rounded-lg" />
          )}
          {(kind === "pdf" || kind === "text") && (
            <iframe src={url} title={name} className="h-[70vh] w-full rounded-lg border bg-white" />
          )}
          {kind === "other" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileText className="size-7" /></span>
              <p className="text-sm text-muted-foreground">Pré-visualização não disponível para este tipo de arquivo.</p>
              <Button render={<a href={url} download={name} />} size="sm"><Download className="size-3.5" /> Baixar arquivo</Button>
            </div>
          )}

          {hasMany && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Anterior"
                className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 shadow-sm hover:bg-background">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Próximo"
                className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 shadow-sm hover:bg-background">
                <ChevronRight className="size-4" />
              </button>
            </>
          )}
        </div>

        {hasMany && (
          <div className="flex gap-2 overflow-x-auto border-t px-3 py-2">
            {items.map((item, i) => {
              const thumbKind = attachmentKind(item);
              const active = i === safeIndex;
              return (
                <button key={item.id || i} type="button" onClick={() => setIndex(i)}
                  className={cn("flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border", active ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50")}>
                  {thumbKind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attachmentUrl(item)} alt="" className="size-full object-cover" />
                  ) : (
                    <FileText className="size-4 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
