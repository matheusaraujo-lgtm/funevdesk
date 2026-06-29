"use client";

import { useEffect, useState } from "react";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// Permite ao solicitante (criador) desistir do chamado e justificar para o suporte.
export function CancelTicketDialog({ open, onOpenChange, onConfirm, loading = false, ticketNumber }) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReason("");
    }
  }, [open]);

  const tooShort = reason.trim().length < 3;

  function handleSubmit(event) {
    event.preventDefault();
    if (tooShort) return;
    onConfirm?.(reason.trim());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Cancelar chamado{ticketNumber ? ` #${ticketNumber}` : ""}</DialogTitle>
            <DialogDescription>
              Conte para o suporte por que este atendimento não é mais necessário. O chamado será encerrado e a equipe avisada.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label htmlFor="cancel-reason" className="mb-1.5 block text-sm font-medium">
              Motivo do cancelamento <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Ex.: resolvi por conta própria, abri por engano, não preciso mais..."
              className="resize-none text-sm"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={loading || tooShort}>
              {loading ? <Loader2 className="animate-spin" /> : <XCircle />}
              Cancelar chamado
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
