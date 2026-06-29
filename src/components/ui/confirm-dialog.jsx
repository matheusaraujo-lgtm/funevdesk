"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Diálogo de confirmação estilizado — substitui o window.confirm() nativo,
// que travava o event loop e destoava do restante do sistema.
// Controlado por um alvo: passe `open` como Boolean(target) e `onOpenChange`
// para limpar o alvo ao fechar.
export function ConfirmDialog({
  open,
  onOpenChange,
  title = "Confirmar exclusão",
  description,
  confirmLabel = "Excluir",
  cancelLabel = "Cancelar",
  variant = "destructive",
  loading = false,
  onConfirm,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{cancelLabel}</Button>
          <Button variant={variant} onClick={onConfirm} disabled={loading}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
