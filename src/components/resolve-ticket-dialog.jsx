"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, MessageSquareText, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RichTextEditor } from "@/components/rich-text-editor";
import { isRichTextEmpty } from "@/lib/rich-text";

function macroToHtml(body) {
  return String(body || "")
    .split(/\n+/)
    .filter((line) => line.trim())
    .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("");
}

// stockEntries: [{ itemId, qty, label }] — campos STOCK do chamado.
export function ResolveTicketDialog({ open, onOpenChange, onConfirm, loading = false, stockEntries = [], branchId }) {
  const [resolution, setResolution] = useState("");
  const [inventory, setInventory] = useState([]);
  const [checked, setChecked] = useState({});
  const [macros, setMacros] = useState([]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/macros", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { macros: [] }))
      .then((data) => setMacros(data.macros || []))
      .catch(() => setMacros([]));
  }, [open]);

  useEffect(() => {
    if (!open) {
      // Reseta o formulário ao fechar/abrir o diálogo de resolução.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolution("");
      return;
    }
    // Por padrão, todos os itens de estoque vêm marcados para dar saída.
    setChecked(Object.fromEntries(stockEntries.map((entry) => [entry.itemId, true])));
  }, [open, stockEntries]);

  useEffect(() => {
    if (!open || !stockEntries.length || !branchId) return;
    fetch(`/api/inventory?branchId=${encodeURIComponent(branchId)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((data) => setInventory(data.items || []))
      .catch(() => setInventory([]));
  }, [open, stockEntries.length, branchId]);

  const items = useMemo(
    () => stockEntries.map((entry) => {
      const item = inventory.find((row) => row.id === entry.itemId);
      return {
        itemId: entry.itemId,
        qty: entry.qty || 1,
        name: item?.name || entry.label || "Item de estoque",
        unit: item?.unit || "un",
        available: item?.quantity,
      };
    }),
    [stockEntries, inventory]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    if (isRichTextEmpty(resolution)) {
      return toast.error("Informe a descrição da resolução para o cliente.");
    }
    const deductions = items
      .filter((item) => checked[item.itemId])
      .map((item) => ({ itemId: item.itemId, qty: item.qty }));
    const shortage = items.find((item) => checked[item.itemId] && typeof item.available === "number" && item.available < item.qty);
    if (shortage) {
      return toast.error(`Estoque insuficiente para "${shortage.name}" (disponível: ${shortage.available}).`);
    }
    await onConfirm?.(resolution, deductions);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Resolver chamado</DialogTitle>
            <DialogDescription>
              Descreva a solução aplicada. A mensagem aparecerá na conversa do chamado para o solicitante.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Descrição da resolução para o cliente
                <span className="ml-1 text-destructive">*</span>
              </p>
              {macros.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs" />}>
                    <MessageSquareText className="size-3.5" /> Resposta pronta <ChevronDown className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-72 w-72 overflow-y-auto">
                    {macros.map((macro) => (
                      <DropdownMenuItem key={macro.id} onClick={() => setResolution(macroToHtml(macro.body))}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{macro.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{macro.body}</p>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <RichTextEditor
              value={resolution}
              onChange={setResolution}
              placeholder="Explique o que foi feito para resolver o problema..."
              minHeight="200px"
              allowImages
              allowFiles
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Você pode colar imagens, anexar fotos ou arquivos (PDF, TXT, até 10 MB).
            </p>
          </div>

          {items.length > 0 && (
            <div className="mb-2 rounded-lg border bg-muted/20 p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Package className="size-4 text-primary" />
                Saída de estoque
              </p>
              <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
                Confirme os itens que saíram do estoque ao resolver este chamado.
              </p>
              <div className="space-y-1.5">
                {items.map((item) => {
                  const short = typeof item.available === "number" && item.available < item.qty;
                  return (
                    <label key={item.itemId} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm">
                      <Checkbox
                        checked={Boolean(checked[item.itemId])}
                        onCheckedChange={(value) => setChecked((current) => ({ ...current, [item.itemId]: Boolean(value) }))}
                      />
                      <span className="flex-1">
                        Dar saída de <strong>{item.qty} {item.unit}</strong> · {item.name}
                      </span>
                      {typeof item.available === "number" && (
                        <span className={short ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
                          {short ? "estoque insuficiente" : `em estoque: ${item.available}`}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || isRichTextEmpty(resolution)}>
              {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Confirmar resolução
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
