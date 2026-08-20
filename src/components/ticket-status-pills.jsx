import { Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { statusColorStyle, STATUS_TONE_PILL, ticketStatusTone } from "@/lib/status-colors";

const statusLabels = {
  ABERTO: "Aberto",
  EM_ATENDIMENTO: "Em atendimento",
  PENDENTE: "Pendente",
  RESOLVIDO: "Resolvido",
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  CRITICA: "Crítica",
  OK: "SLA OK",
  DENTRO_PRAZO: "SLA OK",
  ATENCAO: "SLA em risco",
  EM_RISCO: "SLA em risco",
  VIOLADO: "SLA violado",
};

const pillStyles = {
  status: "border-sky-200 bg-sky-50 text-sky-700",
  priorityHigh: "border-red-200 bg-red-50 text-red-600",
  priorityMedium: "border-amber-200 bg-amber-50 text-amber-700",
  slaOk: "border-emerald-200 bg-emerald-50 text-emerald-700",
  slaBad: "border-red-200 bg-red-50 text-red-600",
  mine: "border-blue-200 bg-blue-50 text-blue-700",
};

function TicketPill({ label, className, style }) {
  return (
    <Badge variant="outline" className={cn("h-6 rounded-full px-2.5 text-[11px] font-semibold", className)} style={style}>
      {label}
    </Badge>
  );
}

export function TicketStatusPills({
  ticket,
  statuses = [],
  isMine = false,
  showMine = false,
  canManage = false,
  isTerminal = false,
  terminalStatusCode = "RESOLVIDO",
  onStatusChange,
  onResolve,
  onPending,
}) {
  const statusMeta = statuses.find((item) => item.code === ticket.status);
  const statusLabel = statusMeta?.label || statusLabels[ticket.status] || ticket.status;
  const statusToneClass = STATUS_TONE_PILL[ticketStatusTone(ticket.status, { isTerminal: statusMeta?.is_terminal || isTerminal })];
  // Cor personalizada da situação (hex ou tom nomeado) tem prioridade sobre a paleta padrão.
  const statusColor = statusMeta?.color ? statusColorStyle(statusMeta.color) : null;
  const priority = ticket.priority;
  const sla = ticket.sla_status;

  const priorityStyle =
    priority === "ALTA" || priority === "CRITICA" ? pillStyles.priorityHigh : pillStyles.priorityMedium;
  const slaStyle = sla === "VIOLADO" || sla === "ATENCAO" || sla === "EM_RISCO" ? pillStyles.slaBad : pillStyles.slaOk;

  const editable = canManage && !isTerminal;

  function handleSelect(code) {
    if (code === ticket.status) return;
    const target = statuses.find((item) => item.code === code);
    const terminalTarget = target?.is_terminal || code === terminalStatusCode;
    // Status terminal (resolvido) exige descrição da resolução: delega ao diálogo de Resolver.
    if (terminalTarget) {
      onResolve?.();
      return;
    }
    // Situação marcada como "exige motivo" (Configurações > Situações): delega ao diálogo
    // de pendência em vez de aplicar a mudança direto.
    const currentMeta = statuses.find((item) => item.code === ticket.status);
    if (target?.requires_reason && !currentMeta?.requires_reason) {
      onPending?.(target);
      return;
    }
    onStatusChange?.(code);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {editable ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={`Situação: ${statusLabel}. Clique para alterar.`}
                style={statusColor || undefined}
                className={cn(
                  "inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  !statusColor && statusToneClass
                )}
              />
            }
          >
            {statusLabel}
            <ChevronDown className="size-3" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {statuses
              .filter((item) => isMine || !(item.is_terminal || item.code === terminalStatusCode))
              .map((item) => (
                <DropdownMenuItem key={item.code} onClick={() => handleSelect(item.code)}>
                  <Check className={cn("size-3.5", item.code === ticket.status ? "opacity-100" : "opacity-0")} />
                  {item.label || statusLabels[item.code] || item.code}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <TicketPill label={statusLabel} className={statusColor ? undefined : statusToneClass} style={statusColor || undefined} />
      )}
      <TicketPill label={statusLabels[priority] || priority} className={priorityStyle} />
      {sla && <TicketPill label={statusLabels[sla] || sla} className={slaStyle} />}
      {showMine && isMine && <TicketPill label="Seu chamado" className={pillStyles.mine} />}
    </div>
  );
}
