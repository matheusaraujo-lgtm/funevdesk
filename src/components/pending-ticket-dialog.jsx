"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Clock3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn, toDatetimeLocalValue } from "@/lib/utils";

const REASON_MAX = 500;

// Atalhos de prazo mais comuns no follow-up de pendência.
const QUICK_REOPEN = [
  { label: "Amanhã", days: 1 },
  { label: "Em 3 dias", days: 3 },
  { label: "Em 7 dias", days: 7 },
];

function reopenValueInDays(days) {
  return toDatetimeLocalValue(new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString());
}

// Situações marcadas como "exige motivo" em Configurações > Situações (ex.: Pendente)
// pedem motivo + data de reabertura antes de aplicar a mudança — nível de gestão vê o
// porquê no histórico, e o chamado volta sozinho na data marcada (follow-up, estilo GLPI).
export function PendingTicketDialog({ open, onOpenChange, onConfirm, loading = false, targetLabel, ticketNumber }) {
  const [reason, setReason] = useState("");
  const [reopenAt, setReopenAt] = useState(reopenValueInDays(1));
  // Atalho de prazo selecionado (null = data digitada manualmente).
  const [quickDays, setQuickDays] = useState(1);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReason("");
      setReopenAt(reopenValueInDays(1));
      setQuickDays(1);
    }
  }, [open]);

  const tooShort = reason.trim().length < 3;
  const invalid = tooShort || !reopenAt;

  function handleSubmit(event) {
    event.preventDefault();
    if (invalid) return;
    onConfirm?.({ reason: reason.trim(), reopenAt: new Date(reopenAt).toISOString() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="flex-row items-start gap-3.5">
            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Clock3 className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="flex flex-wrap items-center gap-2">
                Mover para &quot;{targetLabel}&quot;
                {ticketNumber && <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">#{ticketNumber}</span>}
              </DialogTitle>
              <DialogDescription>
                Registre o motivo e defina quando o chamado deve voltar à fila. Ele reabre
                sozinho na data marcada, mesmo sem ninguém mexer.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="grid gap-5 py-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label htmlFor="pending-reason">
                  Motivo <span className="text-destructive">*</span>
                </Label>
                <span className={cn("text-[11px] tabular-nums", reason.length >= REASON_MAX ? "text-destructive" : "text-muted-foreground")}>
                  {reason.length}/{REASON_MAX}
                </span>
              </div>
              <Textarea
                id="pending-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                maxLength={REASON_MAX}
                placeholder="Ex.: aguardando peça do fornecedor, aguardando retorno do usuário..."
                className="resize-none text-sm"
                autoFocus
              />
              <p className="mt-1.5 text-xs text-muted-foreground">O motivo fica visível no histórico do chamado.</p>
            </div>

            <div>
              <Label htmlFor="pending-reopen-at" className="mb-1.5 block">
                Reabrir automaticamente em <span className="text-destructive">*</span>
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <CalendarClock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="pending-reopen-at"
                    type="datetime-local"
                    value={reopenAt}
                    onChange={(event) => { setReopenAt(event.target.value); setQuickDays(null); }}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-1.5">
                  {QUICK_REOPEN.map((option) => (
                    <Button
                      key={option.days}
                      type="button"
                      size="sm"
                      variant={quickDays === option.days ? "secondary" : "outline"}
                      className="rounded-full text-xs"
                      onClick={() => { setReopenAt(reopenValueInDays(option.days)); setQuickDays(option.days); }}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || invalid}>
              {loading ? <Loader2 className="animate-spin" /> : <Clock3 />}
              Mover para {targetLabel ? `"${targetLabel}"` : "pendente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
