"use client";

import {
  ArrowLeft,
  Clock3,
  Flag,
  Monitor,
} from "lucide-react";
import { TicketStatusPills } from "@/components/ticket-status-pills";

const originLabels = { PORTAL: "Portal web", AGENT: "Agente da máquina", MONITOR: "Monitoramento automático" };
const typeLabels = { INCIDENTE: "Incidente", REQUISICAO: "Requisição" };
const priorityLabels = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" };

function InlineMetric({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 bg-background/80 px-2.5 py-1.5">
      <Icon className="size-3 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-[11px] font-semibold">{value}</p>
      </div>
    </div>
  );
}

export function TicketDetailHeader({
  ticket,
  statusList,
  permissions,
  isMine,
  isTerminal,
  activity,
  onBack,
  onResolve,
  onStatusChange,
}) {
  const subtitle = [
    ticket.ticket_type_name || typeLabels[ticket.kind] || ticket.kind,
    ticket.source === "MONITOR" ? "Monitoramento" : ticket.category,
    `Atualizado ${formatRelativeHeader(ticket.updated_at)}`,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <section className="ticket-shell mb-3 overflow-hidden">
      {/* Ações (Assumir/Transferir/Resolver) ficam só no painel lateral "Atendimento". */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" />
          Voltar <span className="font-mono text-foreground">#{ticket.number}</span>
        </button>
      </div>

      <div className="space-y-2 px-3 py-2.5">
        <div>
          <h1 className="font-heading text-lg font-bold leading-snug tracking-tight lg:text-xl">{ticket.title}</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <TicketStatusPills
          ticket={ticket}
          statuses={statusList}
          isMine={isMine}
          showMine={permissions.canManageTickets}
          canManage={permissions.canManageTickets}
          isTerminal={isTerminal}
          onStatusChange={onStatusChange}
          onResolve={onResolve}
        />
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
          <InlineMetric icon={Flag} label="Prioridade" value={priorityLabels[ticket.priority] || ticket.priority} />
          <InlineMetric icon={Monitor} label="Origem" value={originLabels[ticket.source] || ticket.source} />
          <InlineMetric icon={Clock3} label="Atividade" value={`${activity.time} · ${activity.actor}`} />
        </div>
      </div>
    </section>
  );
}

function formatRelativeHeader(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
