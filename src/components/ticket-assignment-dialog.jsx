"use client";

import { ArrowRightLeft, HandMetal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export function TicketAssignmentDialog({
  open,
  onOpenChange,
  isMine,
  currentUserId,
  assigneeId,
  assigneeName,
  technicians = [],
  transferTarget,
  onTransferTargetChange,
  busy,
  onAssume,
  onTransfer,
}) {
  const transferCandidates = technicians.filter((user) => user.id !== assigneeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Responsável do chamado</DialogTitle>
          <DialogDescription>
            {assigneeName ? `Responsável atual: ${assigneeName}.` : "Chamado na fila, sem responsável."} Escolha assumir para você ou transferir para outro técnico.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {!isMine && (
            <Button className="w-full justify-start" onClick={onAssume} disabled={Boolean(busy)}>
              {busy === "assume" ? <Loader2 className="animate-spin" /> : <HandMetal />}
              Assumir chamado
            </Button>
          )}

          {isMine && (
            <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Você já é o responsável. Selecione abaixo para transferir para outro técnico.</p>
          )}

          <Separator />

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Transferir chamado</p>
            <Select value={transferTarget} onValueChange={onTransferTargetChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o técnico...">
                  {(value) => technicians.find((user) => user.id === value)?.name || "Selecione o técnico..."}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {transferCandidates.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                    {user.id === currentUserId ? " (você)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onTransfer} disabled={!transferTarget || Boolean(busy)}>
            {busy === "transfer" ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
