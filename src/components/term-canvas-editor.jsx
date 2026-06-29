"use client";

import { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { AlignCenter, AlignLeft, AlignRight, ImagePlus, Loader2, PenLine, Tag, Trash2, Type } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const TERM_PAGE = { width: 595, height: 842 };

export const TERM_FIELD_OPTIONS = [
  { value: "title", label: "Título do termo" },
  { value: "branch_name", label: "Unidade" },
  { value: "hostname", label: "Equipamento" },
  { value: "equipment_type", label: "Tipo do equipamento" },
  { value: "patrimony_number", label: "Patrimônio" },
  { value: "signer_name", label: "Nome do signatário" },
  { value: "signer_document", label: "Documento" },
  { value: "body", label: "Texto do termo" },
  { value: "date", label: "Data de emissão" },
];

let idCounter = 0;
function newId() {
  idCounter += 1;
  return `el_${Date.now().toString(36)}_${idCounter}`;
}

function fieldLabel(field) {
  return TERM_FIELD_OPTIONS.find((option) => option.value === field)?.label || field;
}

export function defaultTermLayout(template) {
  const title = template?.title || "TERMO DE USO DE EQUIPAMENTO";
  return {
    page: { ...TERM_PAGE },
    elements: [
      { id: newId(), type: "text", x: 50, y: 40, w: 495, h: 36, text: title, fontSize: 18, bold: true, align: "center", color: "#102033" },
      { id: newId(), type: "field", x: 50, y: 100, w: 495, h: 22, field: "branch_name", label: "Unidade:", fontSize: 12, bold: false, align: "left", color: "#111111" },
      { id: newId(), type: "field", x: 50, y: 126, w: 495, h: 22, field: "hostname", label: "Equipamento:", fontSize: 12, bold: false, align: "left", color: "#111111" },
      { id: newId(), type: "field", x: 50, y: 152, w: 495, h: 22, field: "patrimony_number", label: "Patrimônio:", fontSize: 12, bold: false, align: "left", color: "#111111" },
      { id: newId(), type: "field", x: 50, y: 178, w: 495, h: 22, field: "signer_name", label: "Responsável:", fontSize: 12, bold: false, align: "left", color: "#111111" },
      { id: newId(), type: "field", x: 50, y: 220, w: 495, h: 320, field: "body", label: "", fontSize: 12, bold: false, align: "left", color: "#111111" },
      { id: newId(), type: "signature", x: 50, y: 700, w: 280, h: 60, label: "Assinatura", fontSize: 12, bold: false, align: "left", color: "#111111" },
    ],
  };
}

function normalizeLayout(value) {
  if (value && Array.isArray(value.elements) && value.elements.length) {
    return value.elements.map((element) => ({
      id: element.id || newId(),
      type: element.type || "text",
      x: Number(element.x) || 0,
      y: Number(element.y) || 0,
      w: Number(element.w) || 120,
      h: Number(element.h) || 24,
      text: element.text || "",
      field: element.field || "branch_name",
      label: element.label ?? "",
      src: element.src || "",
      fontSize: Number(element.fontSize) || 12,
      bold: Boolean(element.bold),
      align: element.align || "left",
      color: element.color || "#111111",
    }));
  }
  return defaultTermLayout(value?.template).elements;
}

export function TermCanvasEditor({ value, onChange, readOnly = false }) {
  const [elements, setElements] = useState(() => normalizeLayout(value));
  const [selectedId, setSelectedId] = useState(null);
  const [scale, setScale] = useState(0.8);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const lastEmitted = useRef(JSON.stringify(elements));

  useEffect(() => {
    const incoming = JSON.stringify(value?.elements || null);
    if (value?.elements && incoming !== lastEmitted.current) {
      const normalized = normalizeLayout(value);
      setElements(normalized);
      lastEmitted.current = JSON.stringify(normalized);
    }
  }, [value]);

  function commit(next) {
    setElements(next);
    lastEmitted.current = JSON.stringify(next);
    onChange?.({ page: { ...TERM_PAGE }, elements: next });
  }

  function updateElement(id, patch) {
    commit(elements.map((element) => (element.id === id ? { ...element, ...patch } : element)));
  }

  function addElement(type) {
    const base = {
      id: newId(),
      type,
      x: 60,
      y: 60,
      w: type === "signature" ? 280 : 240,
      h: type === "image" ? 120 : type === "signature" ? 60 : 28,
      text: type === "text" ? "Novo texto" : "",
      field: "branch_name",
      label: type === "field" ? "Rótulo:" : type === "signature" ? "Assinatura" : "",
      src: "",
      fontSize: 12,
      bold: false,
      align: "left",
      color: "#111111",
    };
    commit([...elements, base]);
    setSelectedId(base.id);
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/image\/(png|jpe?g)/.test(file.type)) {
      return toast.error("Use imagens PNG ou JPG para o PDF.");
    }
    setUploading(true);
    try {
      const { uploadRichTextFile } = await import("@/lib/rich-text");
      const publicUrl = await uploadRichTextFile(file);
      const base = {
        id: newId(),
        type: "image",
        x: 60,
        y: 60,
        w: 160,
        h: 120,
        text: "",
        field: "branch_name",
        label: "",
        src: publicUrl,
        fontSize: 12,
        bold: false,
        align: "left",
        color: "#111111",
      };
      commit([...elements, base]);
      setSelectedId(base.id);
    } catch (error) {
      toast.error(error.message || "Falha no upload da imagem.");
    } finally {
      setUploading(false);
    }
  }

  function removeSelected() {
    if (!selectedId) return;
    commit(elements.filter((element) => element.id !== selectedId));
    setSelectedId(null);
  }

  const selected = elements.find((element) => element.id === selectedId) || null;

  function renderContent(element) {
    if (element.type === "image") {
      return element.src
        ? <img src={element.src} alt="" className="pointer-events-none size-full object-contain" />
        : <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">Imagem</div>;
    }
    let preview;
    if (element.type === "field") {
      preview = `${element.label ? `${element.label} ` : ""}{${fieldLabel(element.field)}}`;
    } else if (element.type === "signature") {
      preview = `____________________\n${element.label || "Assinatura"}`;
    } else {
      preview = element.text;
    }
    return (
      <div
        className="pointer-events-none size-full overflow-hidden whitespace-pre-wrap break-words"
        style={{
          fontSize: element.fontSize,
          fontWeight: element.bold ? 700 : 400,
          textAlign: element.align,
          color: element.color,
          lineHeight: 1.3,
        }}
      >
        {preview}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="flex-1 space-y-2">
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/30 p-1.5">
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => addElement("text")}><Type className="size-4" />Texto</Button>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => addElement("field")}><Tag className="size-4" />Campo</Button>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => addElement("signature")}><PenLine className="size-4" />Assinatura</Button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleImageUpload} />
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}Imagem
            </Button>
            <div className="ml-auto flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Zoom</span>
              <Select value={String(scale)} onValueChange={(v) => setScale(Number(v))}>
                <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.6">60%</SelectItem>
                  <SelectItem value="0.8">80%</SelectItem>
                  <SelectItem value="1">100%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <div className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/20 p-4">
          <div style={{ width: TERM_PAGE.width * scale, height: TERM_PAGE.height * scale }}>
            <div
              className="relative origin-top-left bg-white shadow-sm"
              style={{ width: TERM_PAGE.width, height: TERM_PAGE.height, transform: `scale(${scale})` }}
              onMouseDown={() => setSelectedId(null)}
            >
              {elements.map((element) => (
                <Rnd
                  key={element.id}
                  scale={scale}
                  bounds="parent"
                  size={{ width: element.w, height: element.h }}
                  position={{ x: element.x, y: element.y }}
                  disableDragging={readOnly}
                  enableResizing={!readOnly}
                  onMouseDown={(event) => { event.stopPropagation(); setSelectedId(element.id); }}
                  onDragStop={(_e, d) => updateElement(element.id, { x: Math.round(d.x), y: Math.round(d.y) })}
                  onResizeStop={(_e, _dir, ref, _delta, position) => updateElement(element.id, {
                    w: Math.round(parseFloat(ref.style.width)),
                    h: Math.round(parseFloat(ref.style.height)),
                    x: Math.round(position.x),
                    y: Math.round(position.y),
                  })}
                  className={cn("box-border border", selectedId === element.id ? "border-primary ring-1 ring-primary" : "border-dashed border-muted-foreground/30")}
                >
                  <div className="size-full p-1">{renderContent(element)}</div>
                </Rnd>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="w-full shrink-0 space-y-3 rounded-lg border p-3 lg:w-72">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold capitalize">{selected.type}</p>
                <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={removeSelected}><Trash2 className="size-4" /></Button>
              </div>

              {selected.type === "text" && (
                <div className="space-y-1">
                  <Label className="text-xs">Texto</Label>
                  <textarea
                    className="min-h-20 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    value={selected.text}
                    onChange={(e) => updateElement(selected.id, { text: e.target.value })}
                  />
                </div>
              )}

              {selected.type === "field" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Campo dinâmico</Label>
                    <Select value={selected.field} onValueChange={(v) => updateElement(selected.id, { field: v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{TERM_FIELD_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Rótulo (opcional)</Label>
                    <Input className="h-8" value={selected.label} onChange={(e) => updateElement(selected.id, { label: e.target.value })} />
                  </div>
                </>
              )}

              {selected.type === "signature" && (
                <div className="space-y-1">
                  <Label className="text-xs">Rótulo da assinatura</Label>
                  <Input className="h-8" value={selected.label} onChange={(e) => updateElement(selected.id, { label: e.target.value })} />
                </div>
              )}

              {selected.type !== "image" && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Tamanho fonte</Label>
                      <Input className="h-8" type="number" min={6} max={72} value={selected.fontSize} onChange={(e) => updateElement(selected.id, { fontSize: Number(e.target.value) || 12 })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cor</Label>
                      <input type="color" className="h-8 w-12 rounded border bg-background" value={selected.color} onChange={(e) => updateElement(selected.id, { color: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant={selected.bold ? "default" : "outline"} size="sm" className="h-8" onClick={() => updateElement(selected.id, { bold: !selected.bold })}>B</Button>
                    <Button type="button" variant={selected.align === "left" ? "default" : "outline"} size="icon" className="size-8" onClick={() => updateElement(selected.id, { align: "left" })}><AlignLeft className="size-4" /></Button>
                    <Button type="button" variant={selected.align === "center" ? "default" : "outline"} size="icon" className="size-8" onClick={() => updateElement(selected.id, { align: "center" })}><AlignCenter className="size-4" /></Button>
                    <Button type="button" variant={selected.align === "right" ? "default" : "outline"} size="icon" className="size-8" onClick={() => updateElement(selected.id, { align: "right" })}><AlignRight className="size-4" /></Button>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs">X</Label><Input className="h-8" type="number" value={selected.x} onChange={(e) => updateElement(selected.id, { x: Number(e.target.value) || 0 })} /></div>
                <div className="space-y-1"><Label className="text-xs">Y</Label><Input className="h-8" type="number" value={selected.y} onChange={(e) => updateElement(selected.id, { y: Number(e.target.value) || 0 })} /></div>
                <div className="space-y-1"><Label className="text-xs">Largura</Label><Input className="h-8" type="number" value={selected.w} onChange={(e) => updateElement(selected.id, { w: Number(e.target.value) || 10 })} /></div>
                <div className="space-y-1"><Label className="text-xs">Altura</Label><Input className="h-8" type="number" value={selected.h} onChange={(e) => updateElement(selected.id, { h: Number(e.target.value) || 10 })} /></div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Selecione um elemento para editar, ou adicione novos pela barra de ferramentas. Campos dinâmicos são preenchidos automaticamente no PDF.</p>
          )}
        </div>
      )}
    </div>
  );
}
