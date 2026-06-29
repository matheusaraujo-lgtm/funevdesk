"use client";

import { ArrowRightLeft, CheckCircle2, Computer, HandMetal, Headset, Radar, RotateCcw, XCircle } from "lucide-react";
import { getFirstResponseStatus } from "@/lib/sla";
import { StatusBadge } from "@/components/status-badge";
import { TicketAnalystPanel } from "@/components/ticket-analyst-panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const originLabels = { PORTAL: "Portal web", AGENT: "Agente da máquina", MONITOR: "Monitoramento automático" };

function initials(name = "") {
  if (!name) return "--";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

const firstResponseMeta = {
  CUMPRIDO: { label: "Cumprida", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  DENTRO_PRAZO: { label: "No prazo", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  EM_RISCO: { label: "Em risco", className: "border-amber-200 bg-amber-50 text-amber-700" },
  VIOLADO: { label: "Violada", className: "border-red-200 bg-red-50 text-red-700" },
};

function FirstResponseBadge({ dueAt, respondedAt }) {
  const status = getFirstResponseStatus(dueAt, respondedAt);
  const meta = firstResponseMeta[status];
  if (!meta) return null;
  return <Badge variant="outline" className={cn("h-4 rounded-full px-1.5 text-[9px]", meta.className)}>{meta.label}</Badge>;
}

function MetaRow({ label, value }) {
  return (
    <div className="flex justify-between gap-2 py-0.5 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[55%] truncate text-right font-medium">{value || "--"}</span>
    </div>
  );
}

function HealthBar({ label, value = 0 }) {
  const numeric = Number(value) || 0;
  const tone = numeric >= 85 ? "bg-red-500" : numeric >= 70 ? "bg-amber-500" : "bg-primary";
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-semibold tabular-nums", numeric >= 85 && "text-red-600")}>{numeric.toFixed(0)}%</span>
      </div>
      <Progress value={numeric}>
        <ProgressTrack className="h-1 bg-muted">
          <ProgressIndicator className={tone} />
        </ProgressTrack>
      </Progress>
    </div>
  );
}

export function TicketDetailSidebar({ ticket, permissions, isMine, isTerminal, canCancel, sla, slaProgressPercent, onAssume, onOpenAssignment, onConnectRemote, onResolve, onReopen, onCancel, busy }) {
  const hasMachine = Boolean(ticket.asset_id || ticket.hostname);
  const isUnassigned = !ticket.assignee_id;

  return (
    <aside className="ticket-shell shrink-0 py-0 shadow-none">
      <div className="border-b border-border/70 px-3 py-2.5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Atendimento</p>
        <div className="flex items-center gap-2">
          {!isUnassigned && (
            <Avatar className="size-8">
              <AvatarFallback className={cn(isMine ? "bg-primary text-primary-foreground text-[10px]" : "bg-muted text-[10px]")}>
                {initials(ticket.assignee_name)}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{ticket.assignee_name || "Aguardando fila"}</p>
            <p className="text-[10px] text-muted-foreground">{ticket.assignee_name ? "Suporte" : "Sem responsável"}</p>
          </div>
          {isMine && <Badge variant="outline" className="h-4 rounded-full border-blue-200 bg-blue-50 px-1.5 text-[9px] text-blue-700">Seu</Badge>}
        </div>
        {permissions.canManageTickets && !isTerminal && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {/* Quem assumiu (responsável) vê Resolver no lugar de Assumir. */}
            {isMine ? (
              <Button size="sm" className="h-7 text-xs" onClick={onResolve}>
                <CheckCircle2 className="size-3" /> Resolver
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onAssume}>
                <HandMetal className="size-3" /> Assumir
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onOpenAssignment}>
              <ArrowRightLeft className="size-3" /> Transferir
            </Button>
          </div>
        )}
        {/* Chamado encerrado: a equipe pode reabri-lo (volta a um status ativo). */}
        {permissions.canManageTickets && isTerminal && (
          <Button variant="outline" size="sm" className="mt-2 h-7 w-full text-xs" onClick={onReopen} disabled={busy === "reopen"}>
            <RotateCcw className="size-3" /> {busy === "reopen" ? "Reabrindo..." : "Reabrir chamado"}
          </Button>
        )}
        {permissions.canManageTickets && (
          <div className="mt-1.5">
            <TicketAnalystPanel ticketId={ticket.id} />
          </div>
        )}
        {/* O criador do chamado pode desistir enquanto o atendimento não foi encerrado. */}
        {canCancel && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-7 w-full border-destructive/30 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={onCancel}
            disabled={busy === "cancel"}
          >
            <XCircle className="size-3" /> {busy === "cancel" ? "Cancelando..." : "Cancelar chamado"}
          </Button>
        )}
      </div>

      {(ticket.sla_status || ticket.sla_due_at) && (
        <div className="border-b border-border/70 px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SLA</p>
            {ticket.sla_status && <StatusBadge value={ticket.sla_status} />}
          </div>
          <p className="text-xs font-semibold">{sla?.label || "--"}</p>
          <Progress value={slaProgressPercent} className="mt-1.5">
            <ProgressTrack className="h-1.5 bg-muted">
              <ProgressIndicator className={ticket.sla_status === "VIOLADO" ? "bg-red-500" : "bg-emerald-500"} />
            </ProgressTrack>
          </Progress>
          {ticket.first_response_due_at && (
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">1ª resposta</span>
              <FirstResponseBadge dueAt={ticket.first_response_due_at} respondedAt={ticket.first_response_at} />
            </div>
          )}
        </div>
      )}

      <div className="border-b border-border/70 px-3 py-2.5">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Solicitante</p>
        <div className="mb-1.5 flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">{initials(ticket.requester_name || ticket.logged_user)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{ticket.requester_name || ticket.logged_user}</p>
            <p className="truncate text-[10px] text-muted-foreground">{ticket.requester_email || ticket.branch_name}</p>
          </div>
        </div>
        <MetaRow label="Unidade" value={ticket.branch_name} />
        <MetaRow label="Origem" value={originLabels[ticket.source] || ticket.source} />
        {ticket.location_name && <MetaRow label="Localização" value={ticket.location_name} />}
      </div>

      {hasMachine && (
        <div className="px-3 py-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Equipamento</p>
          <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/20 p-2">
            <Computer className="size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{ticket.hostname}</p>
              <p className="truncate text-[10px] text-muted-foreground">{ticket.os_name || "--"}</p>
            </div>
            {ticket.asset_status && <StatusBadge value={ticket.asset_status} />}
          </div>
          {permissions.canRemoteAccess && (
            <Button
              variant="outline"
              size="sm"
              className="mb-2 h-7 w-full text-xs"
              onClick={onConnectRemote}
              disabled={!ticket.hostname}
            >
              <Headset className="size-3" /> Conectar remoto
            </Button>
          )}
          <MetaRow label="IP" value={ticket.ip_address} />
          <MetaRow label="Usuário" value={ticket.logged_user} />
          <div className="mt-2.5 space-y-1.5">
            <HealthBar label="CPU" value={ticket.cpu_percent} />
            <HealthBar label="Memória" value={ticket.memory_percent} />
            <HealthBar label="Disco" value={ticket.disk_percent} />
          </div>
          {ticket.source === "MONITOR" && (
            <div className="mt-2.5 flex items-center gap-2 rounded-md border bg-muted/15 p-2 text-[10px]">
              <Radar className="size-3 text-primary" />
              <span>Agente FunevDesk</span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
