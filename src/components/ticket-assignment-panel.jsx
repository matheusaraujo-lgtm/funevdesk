"use client";

import { useState } from "react";
import { ArrowRightLeft, HandMetal, Headset, Loader2, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";

function initials(name = "") {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "—";
}

function slaSummary(ticket) {
  if (!ticket.sla_due_at) return null;
  const due = new Date(ticket.sla_due_at);
  const diffMs = due.getTime() - Date.now();
  const absHours = Math.abs(Math.round(diffMs / 3600000));
  if (ticket.sla_status === "VIOLADO") return { label: `Violado há ${absHours}h`, tone: "destructive" };
  if (ticket.sla_status === "ATENCAO" || ticket.sla_status === "EM_RISCO") return { label: `${absHours}h restantes`, tone: "warning" };
  return { label: `${absHours}h restantes`, tone: "success" };
}

export function TicketAssignmentPanel({
  ticket,
  currentUser,
  permissions,
  users = [],
  teams = [],
  ticketStatuses = [],
  terminalStatusCode = "RESOLVIDO",
  onAssume,
  onRelease,
  onPatch,
  onRemoteAccess,
  compact = false,
}) {
  const [busy, setBusy] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const technicians = users.filter((u) => u.active && (u.role === "ADMIN" || u.role === "TECHNICIAN"));
  const transferCandidates = technicians.filter((u) => u.id !== ticket.assignee_id);
  const isMine = ticket.assignee_id === currentUser.id;
  const isUnassigned = !ticket.assignee_id;
  const statusMeta = ticketStatuses.find((item) => item.code === ticket.status);
  const isResolved = statusMeta?.is_terminal || ticket.status === terminalStatusCode;
  const isInProgress = ticket.status === "EM_ATENDIMENTO";
  const canManage = permissions.canManageTickets;
  const sla = slaSummary(ticket);

  async function run(action, fn) {
    setBusy(action);
    try {
      await fn();
    } finally {
      setBusy("");
    }
  }

  async function handleAssume() {
    await run("assume", async () => {
      const ok = await onAssume?.(ticket.id);
      if (ok) toast.success(isMine ? "Chamado atualizado." : "Chamado assumido. Você é o responsável.");
    });
  }

  async function handleRelease() {
    await run("release", async () => {
      const ok = await onPatch?.(ticket.id, { assigneeId: null, status: ticket.status === "EM_ATENDIMENTO" ? "ABERTO" : ticket.status });
      if (ok) toast.success("Chamado liberado para a fila.");
    });
  }

  async function handleTransfer(userId) {
    if (!userId) return;
    await run("transfer", async () => {
      const ok = await onPatch?.(ticket.id, { assigneeId: userId });
      if (ok) {
        toast.success("Chamado transferido.");
        setTransferOpen(false);
        setTransferTarget("");
      }
    });
  }

  async function confirmTransfer() {
    if (!transferTarget) return toast.error("Selecione um técnico.");
    await handleTransfer(transferTarget);
  }

  async function handleTeam(teamId) {
    await run("team", async () => {
      const ok = await onPatch?.(ticket.id, { teamId: teamId === "none" ? null : teamId });
      if (ok) toast.success("Equipe atualizada.");
    });
  }

  async function connectRemote() {
    const result = await onRemoteAccess?.(ticket.id);
    if (!result) return;
    toast.info(result.notice);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          {!isUnassigned && (
            <Avatar className="size-10">
              <AvatarFallback className={isMine ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}>
                {initials(ticket.assignee_name)}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0 flex-1">
            {isUnassigned ? (
              <>
                <p className="text-sm font-semibold text-muted-foreground">Na fila</p>
                <p className="text-xs text-muted-foreground">Aguardando técnico</p>
              </>
            ) : (
              <>
                <p className="truncate text-sm font-semibold">{ticket.assignee_name}</p>
                <p className="text-xs text-muted-foreground">{isMine ? "Atribuído a você" : "Outro técnico"}</p>
              </>
            )}
          </div>
          {isMine && <Badge variant="success" className="shrink-0">Seu</Badge>}
        </div>

        {canManage && !isResolved && (
          <div className="mt-3 grid gap-2">
            {!isMine && (
              <Button className="w-full" size="sm" onClick={handleAssume} disabled={Boolean(busy)}>
                {busy === "assume" ? <Loader2 className="animate-spin" /> : <HandMetal />}
                Assumir chamado
              </Button>
            )}
            {isMine && (
              <Button variant="outline" className="w-full" size="sm" onClick={handleRelease} disabled={Boolean(busy)}>
                {busy === "release" ? <Loader2 className="animate-spin" /> : <UserMinus />}
                Liberar chamado
              </Button>
            )}
            {!isUnassigned && !isMine && (
              <Button variant="secondary" className="w-full" size="sm" onClick={handleAssume} disabled={Boolean(busy)}>
                {busy === "assume" ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Transferir para mim
              </Button>
            )}
          </div>
        )}
      </div>

      {canManage && !isResolved && isInProgress && (
        <>
          <Separator />
          <Button variant="outline" className="w-full" size="sm" onClick={() => setTransferOpen(true)} disabled={Boolean(busy) || transferCandidates.length === 0}>
            <ArrowRightLeft /> Transferir
          </Button>
          <Dialog open={transferOpen} onOpenChange={(open) => { setTransferOpen(open); if (!open) setTransferTarget(""); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Transferir chamado</DialogTitle>
                <DialogDescription>Selecione o técnico que assumirá este chamado.</DialogDescription>
              </DialogHeader>
              <Select value={transferTarget} onValueChange={setTransferTarget}>
                <SelectTrigger><SelectValue placeholder="Selecione um técnico..." /></SelectTrigger>
                <SelectContent>
                  {transferCandidates.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}{u.id === currentUser.id ? " (você)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>Cancelar</Button>
                <Button onClick={confirmTransfer} disabled={!transferTarget || Boolean(busy)}>
                  {busy === "transfer" ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
                  Transferir
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {canManage && !isResolved && (
        <>
          <Separator />
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Users className="size-3.5" /> Equipe</p>
            <Select value={ticket.team_id || "none"} onValueChange={handleTeam} disabled={Boolean(busy)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Nenhuma">{(value) => value === "none" ? "Nenhuma" : teams.find((team) => team.id === value)?.name}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {(ticket.sla_status || ticket.sla_due_at) && (
        <>
          <Separator />
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">SLA</p>
              {ticket.sla_status && <StatusBadge value={ticket.sla_status} />}
            </div>
            {sla && <p className={`mt-1.5 text-sm font-semibold ${sla.tone === "destructive" ? "text-destructive" : sla.tone === "warning" ? "text-amber-600" : "text-foreground"}`}>{sla.label}</p>}
            {ticket.sla_due_at && <p className="mt-0.5 text-xs text-muted-foreground">Prazo {new Date(ticket.sla_due_at).toLocaleString("pt-BR")}</p>}
          </div>
        </>
      )}

      {compact && permissions.canRemoteAccess && (
        <>
          <Separator />
          <Button variant="outline" size="sm" className="w-full" onClick={connectRemote} disabled={!ticket.hostname}>
            <Headset /> Acesso remoto
          </Button>
        </>
      )}
    </div>
  );
}
