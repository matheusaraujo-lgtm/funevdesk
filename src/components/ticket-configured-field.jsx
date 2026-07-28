"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  CalendarDays,
  ChevronDown,
  FileUp,
  ImagePlus,
  List,
  LoaderCircle,
  MapPin,
  Package,
  Type,
  X,
} from "lucide-react";
import { AttachmentViewer } from "@/components/attachment-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { attachmentKind, attachmentUrl } from "@/lib/attachments";
import { cn } from "@/lib/utils";

export function TicketFormField({ label, required, hint, children, className = "" }) {
  return (
    <div className={className}>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </p>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function fieldIcon(fieldType) {
  switch (fieldType) {
    case "TEXTAREA": return AlignLeft;
    case "DATE": return CalendarDays;
    case "SELECT":
    case "MULTISELECT": return List;
    case "FILE":
    case "SCREENSHOT": return fieldType === "SCREENSHOT" ? ImagePlus : FileUp;
    case "LOCATION": return MapPin;
    case "STOCK": return Package;
    default: return Type;
  }
}

function statusDot(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (!normalized) return null;
  if (/não|nao|neg|reprov|alta|crític|critica/i.test(normalized)) return "destructive";
  if (/pend|aguard/i.test(normalized)) return "warning";
  if (/sim|ok|conclu|aprov|média|media|baixa/i.test(normalized)) return "success";
  return null;
}

function FieldStatusDot({ value }) {
  const tone = statusDot(value);
  if (!tone) return null;
  const colors = { success: "bg-emerald-500", destructive: "bg-red-500", warning: "bg-amber-500" };
  return <span className={cn("size-1.5 shrink-0 rounded-full", colors[tone])} />;
}

function normalizeOptions(field) {
  if (field.options?.length) return field.options.filter(Boolean);
  if (field.options_json) {
    try {
      const parsed = JSON.parse(field.options_json);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      /* ignore */
    }
  }
  if (field.field_type === "SELECT" && field.value_text) return [field.value_text];
  return [];
}

export function enrichTicketField(response) {
  const value = response.value_text ?? "";
  const options = normalizeOptions(response);
  const fieldType = String(response.field_type || "TEXT").toUpperCase();
  const mergedOptions =
    fieldType === "SELECT" && value && !options.includes(value) ? [...options, value] : options;

  return {
    ...response,
    id: response.id || response.field_id || response.field_label,
    field_type: fieldType,
    field_label: response.field_label || response.label || "Campo",
    value_text: value,
    options: mergedOptions,
    placeholder: response.placeholder || "",
    required: Boolean(response.required),
  };
}

function FileDisplay({ field, attachment, readOnly, onUpload, uploading, onRemove }) {
  const inputRef = useRef(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const isScreenshot = field.field_type === "SCREENSHOT";
  const Icon = isScreenshot ? ImagePlus : FileUp;
  // Aceita os dois formatos: upload recém-feito (camelCase da API) e anexo persistido (snake_case do banco).
  const fileName = attachment?.originalName || attachment?.original_name || field.value_text || "";
  // URL servível: persistido (com id) vai pela rota autenticada /api/attachments/<id>; o
  // link cru /uploads/<uuid> dá 404 sob "standalone". A visualização abre em modal, não em nova aba.
  const fileUrl = attachmentUrl(attachment);

  if (readOnly) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/15 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4 shrink-0 text-primary" />
          {fileUrl ? (
            <button type="button" onClick={() => setViewerOpen(true)} className="truncate text-left font-medium text-primary underline underline-offset-2">
              {fileName || "Abrir arquivo"}
            </button>
          ) : (
            <span>{fileName || "Nenhum arquivo anexado"}</span>
          )}
        </div>
        {fileUrl && <AttachmentViewer attachments={[attachment]} open={viewerOpen} onOpenChange={setViewerOpen} />}
      </div>
    );
  }

  const accept = isScreenshot ? "image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,application/pdf,text/plain";
  const isImage = attachmentKind(attachment) === "image";
  return (
    <div className="rounded-xl border border-dashed bg-muted/15 p-4">
      {fileUrl ? (
        // Após anexar: mostra miniatura (imagem) ou chip do arquivo, clicável para visualizar em modal.
        <div className="mb-3 flex items-center gap-3">
          {isImage ? (
            <button type="button" onClick={() => setViewerOpen(true)} className="shrink-0">
              <img src={fileUrl} alt={fileName} className="size-14 rounded-lg border object-cover" />
            </button>
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span>
          )}
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => setViewerOpen(true)} className="block max-w-full truncate text-left text-sm font-medium text-primary underline underline-offset-2">{fileName || "Abrir arquivo"}</button>
            <p className="text-xs text-muted-foreground">Anexado — clique para visualizar</p>
          </div>
          {!readOnly && onRemove && (
            <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" onClick={onRemove} aria-label="Remover anexo"><X /></Button>
          )}
          <AttachmentViewer attachments={[attachment]} open={viewerOpen} onOpenChange={setViewerOpen} />
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4 shrink-0 text-primary" />
          {isScreenshot ? "Anexe uma captura de tela" : "Anexe um arquivo de apoio"}
        </div>
      )}
      <Input ref={inputRef} className="hidden" type="file" accept={accept} onChange={(e) => onUpload?.(field, e.target.files?.[0])} />
      <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? <LoaderCircle className="animate-spin" /> : <Icon />}
        {fileUrl ? "Trocar arquivo" : "Selecionar arquivo"}
      </Button>
    </div>
  );
}

function LocationField({ value, onChange, readOnly, branchId, placeholder }) {
  const [locations, setLocations] = useState([]);
  useEffect(() => {
    if (!branchId) return;
    fetch(`/api/locations?branchId=${encodeURIComponent(branchId)}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { locations: [] })
      .then((data) => setLocations(data.locations || []))
      .catch(() => setLocations([]));
  }, [branchId]);
  if (readOnly) {
    const label = locations.find((loc) => loc.id === value)?.name || value || "—";
    return <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm"><MapPin className="size-4 text-muted-foreground" />{label}</div>;
  }
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={!branchId}>
      <SelectTrigger className="w-full bg-background">
        <SelectValue placeholder={placeholder || "Selecione a localização"}>
          {(val) => locations.find((loc) => loc.id === val)?.name || (placeholder || "Selecione a localização")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function StockField({ value, onChange, readOnly, branchId, field }) {
  const [items, setItems] = useState([]);
  const parsed = useMemo(() => {
    try { return value ? JSON.parse(value) : { itemId: "", qty: 1, deduct: false }; } catch { return { itemId: "", qty: 1, deduct: false }; }
  }, [value]);
  useEffect(() => {
    if (!branchId) return;
    fetch(`/api/inventory?branchId=${encodeURIComponent(branchId)}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((data) => setItems(data.items || []))
      .catch(() => setItems([]));
  }, [branchId]);
  const categories = (field.options || []).filter(Boolean);
  const filtered = categories.length ? items.filter((item) => categories.some((c) => String(item.category || "").toLowerCase().includes(String(c).toLowerCase()))) : items;

  function update(next) {
    onChange(JSON.stringify({ ...parsed, ...next }));
  }

  if (readOnly) {
    const item = items.find((i) => i.id === parsed.itemId);
    // Resolve o nome do item; enquanto o inventário carrega (ou se o item sumiu),
    // mostra a quantidade — nunca o JSON cru armazenado.
    const label = item
      ? `${item.name} · ${parsed.qty || 1} ${item.unit}`
      : parsed.itemId
        ? `${parsed.qty || 1} un · item de estoque`
        : value || "—";
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <Package className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </div>
    );
  }

  return (
    <Select value={parsed.itemId || undefined} onValueChange={(itemId) => update({ itemId })}>
      <SelectTrigger className="w-full bg-background">
        <SelectValue placeholder="Selecione o item de estoque">
          {(val) => {
            const it = filtered.find((i) => i.id === val) || items.find((i) => i.id === val);
            return it ? `${it.name} · ${it.quantity} ${it.unit}` : "Selecione o item de estoque";
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {filtered.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.name} · {item.quantity} {item.unit}{item.lowStock ? " (baixo)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TicketConfiguredFieldInput({
  field,
  value,
  onChange,
  readOnly = false,
  attachment,
  onUpload,
  onRemove,
  uploading = false,
  showStatusDot = false,
  branchId,
}) {
  const type = field.field_type;

  if (type === "LOCATION") {
    return <LocationField value={value} onChange={onChange} readOnly={readOnly} branchId={branchId} placeholder={field.placeholder} />;
  }

  if (type === "STOCK") {
    return <StockField value={value} onChange={onChange} readOnly={readOnly} branchId={branchId} field={field} />;
  }

  if (type === "TEXTAREA") {
    return (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={field.placeholder || undefined}
        rows={3}
        className="w-full resize-none bg-background"
      />
    );
  }

  if (type === "DATE") {
    return (
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input
          type="date"
          value={value?.slice(0, 10) || ""}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          className="w-full bg-background pl-9"
        />
      </div>
    );
  }

  if (type === "FILE" || type === "SCREENSHOT") {
    return (
      <FileDisplay
        field={field}
        attachment={attachment}
        readOnly={readOnly}
        onUpload={onUpload}
        onRemove={onRemove}
        uploading={uploading}
      />
    );
  }

  if (type === "SELECT") {
    const options = field.options?.length ? field.options : normalizeOptions(field);
    if (readOnly) {
      return (
        <div className="flex h-9 w-full items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm">
          {showStatusDot && value ? <FieldStatusDot value={value} /> : <ChevronDown className="size-4 text-muted-foreground" />}
          <span className="truncate">{value || "—"}</span>
        </div>
      );
    }
    return (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full bg-background">
          <SelectValue placeholder={field.placeholder || "Selecione uma opção"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              <span className="inline-flex items-center gap-1.5">
                {showStatusDot ? <FieldStatusDot value={option} /> : null}
                {option}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (type === "MULTISELECT") {
    const options = field.options?.length ? field.options : normalizeOptions(field);
    const selected = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (readOnly) {
      return (
        <div className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 px-3 py-1.5 text-sm">
          {selected.length ? selected.map((item) => <span key={item} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{item}</span>) : <span className="text-muted-foreground">—</span>}
        </div>
      );
    }
    const toggle = (option) => {
      const next = selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option];
      onChange(next.join(", "));
    };
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSel = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition", isSel ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-muted")}
            >
              {option}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      placeholder={field.placeholder || undefined}
      className="w-full bg-background"
    />
  );
}

export function TicketFieldTypeIcon({ fieldType, className }) {
  return createElement(fieldIcon(fieldType), { className: cn("size-4 text-primary", className) });
}
