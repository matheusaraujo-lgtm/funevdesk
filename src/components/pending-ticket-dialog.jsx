"use client";

import { useEffect, useState } from "react";
import { Clock3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toDatetimeLocalValue } from "@/lib/utils";

function defaultReopenValue() {
  return toDatetimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
}

// Situações marcadas como "exige motivo" em Configurações > Situações (ex.: Pendente)
// pedem motivo + data de reabertura antes de aplicar a mudança — nível de gestão vê o
// porquê no histórico, e o chamado volta sozinho na data marcada (follow-up, estilo GLPI).
export function PendingTicketDialog({ open, onOpenChange, onConfirm, loading = false, targetLabel, ticketNumber }) {
  const [reason, setReason] = useState("");
  const [reopenAt, setReopenAt] = useState(defaultReopenValue());

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReason("");
      setReopenAt(defaultReopenValue());
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
          <DialogHeader>
            <DialogTitle>
              Mover para &quot;{targetLabel}&quot;{ticketNumber ? ` — #${ticketNumber}` : ""}
            </DialogTitle>
            <DialogDescription>
              Esta situação exige motivo e data de reabertura. O chamado volta sozinho na data marcada,
              mesmo que ninguém mexa nele antes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label htmlFor="pending-reason" className="mb-1.5 block">
                Motivo <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="pending-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Ex.: aguardando peça do fornecedor, aguardando retorno do usuário..."
                className="resize-none text-sm"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="pending-reopen-at" className="mb-1.5 block">
                Reabrir automaticamente em <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pending-reopen-at"
                type="datetime-local"
                value={reopenAt}
                onChange={(event) => setReopenAt(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || invalid}>
              {loading ? <Loader2 className="animate-spin" /> : <Clock3 />}
              Confirmar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
