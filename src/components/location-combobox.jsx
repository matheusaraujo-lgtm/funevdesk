"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Seletor de setor/localização COM busca. O menu é renderizado em um portal com posição
// fixa (ancorado no gatilho) para NÃO ser recortado pelo card/overflow do formulário.
export function LocationCombobox({
  locations = [],
  value = "",
  onChange,
  placeholder = "Selecione o setor",
  searchPlaceholder = "Buscar setor...",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  const selected = locations.find((loc) => loc.id === value) || null;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return locations;
    return locations.filter((loc) => loc.name.toLowerCase().includes(term));
  }, [locations, query]);

  // Recalcula a posição do menu ancorada ao gatilho (na abertura, ao rolar e ao redimensionar).
  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Fecha ao clicar fora (gatilho ou menu) e ao apertar Esc.
  useEffect(() => {
    if (!open) return;
    function onPointer(event) {
      if (triggerRef.current?.contains(event.target)) return;
      if (popupRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  function pick(id) {
    onChange?.(id);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <MapPin className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : placeholder}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && rect && typeof document !== "undefined" && createPortal(
        <div
          ref={popupRef}
          style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 60 }}
          className="overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md ring-1 ring-border"
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 bg-background pl-8"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">Nenhum setor encontrado.</p>
            ) : (
              filtered.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => pick(loc.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent",
                    loc.id === value && "bg-accent/60"
                  )}
                >
                  <MapPin className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{loc.name}</span>
                  {loc.id === value && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              ))
            )}
          </div>
          {value && (
            <div className="border-t p-1">
              <button
                type="button"
                onClick={() => pick("")}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <X className="size-4 shrink-0" /> Limpar seleção
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
