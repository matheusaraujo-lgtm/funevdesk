"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function normalizeOptions(options) {
  if (Array.isArray(options)) return options;
  return Object.entries(options).map(([value, label]) => ({ value, label }));
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Selecione...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhum resultado.",
  className,
  triggerClassName,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalized = useMemo(() => normalizeOptions(options), [options]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return normalized;
    return normalized.filter((option) =>
      `${option.label} ${option.description || ""}`.toLowerCase().includes(term)
    );
  }, [normalized, search]);
  const selected = normalized.find((option) => option.value === value);

  function select(optionValue) {
    onValueChange(optionValue);
    setOpen(false);
    setSearch("");
  }

  return (
    <DropdownMenu open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn("h-9 w-full justify-between bg-card font-normal", triggerClassName)}
          />
        }>
        <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
          {selected?.label || placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className={cn("w-(--anchor-width) p-0", className)} align="start">
        <div className="flex items-center border-b px-3" onPointerDown={(event) => event.preventDefault()}>
          <Search className="mr-2 size-4 shrink-0 opacity-50" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 border-0 shadow-none focus-visible:ring-0"
            onKeyDown={(event) => event.stopPropagation()}
          />
        </div>
        <ScrollArea className="max-h-64">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            <div className="p-1">
              {filtered.map((option) => {
                const isSelected = option.value === value;
                return (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => select(option.value)}
                    className={cn("items-start gap-2 rounded-lg px-2.5 py-2", isSelected && "bg-accent/60")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{option.label}</span>
                      {option.description && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{option.description}</span>}
                    </span>
                    {isSelected && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
