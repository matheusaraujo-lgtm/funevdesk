import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isTicketStatusCode, STATUS_TONE_BADGE, ticketStatusTone } from "@/lib/status-colors";

const labels = {
  ABERTO: "Aberto",
  EM_ATENDIMENTO: "Em atendimento",
  PENDENTE: "Pendente",
  RESOLVIDO: "Resolvido",
  CANCELADO: "Cancelado",
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  CRITICA: "Crítica",
  ONLINE: "Disponível",
  OFFLINE: "Desconectado",
  ALERT: "Alerta",
  OK: "SLA OK",
  DENTRO_PRAZO: "SLA OK",
  ATENCAO: "SLA em risco",
  EM_RISCO: "SLA em risco",
  VIOLADO: "SLA violado",
  SEM_SLA: "Sem SLA",
  PAUSADO: "SLA pausado",
};

const variants = {
  RESOLVIDO: "success",
  ONLINE: "success",
  OK: "success",
  DENTRO_PRAZO: "success",
  CRITICA: "destructive",
  ALTA: "destructive",
  VIOLADO: "destructive",
  ALERT: "warning",
  ATENCAO: "warning",
  EM_RISCO: "warning",
  MEDIA: "warning",
  OFFLINE: "muted",
  EM_ATENDIMENTO: "secondary",
  PENDENTE: "warning",
  PAUSADO: "warning",
};

export function StatusBadge({ value, statuses }) {
  const fromConfig = statuses?.find((item) => item.code === value);
  const label = fromConfig?.label || labels[value] || value;
  // Status de chamado seguem a paleta padrão (verde/azul/amarelo/cinza); demais
  // (prioridade, SLA, ativo) mantêm os variants temáticos.
  if (isTicketStatusCode(value, statuses)) {
    const isTerminal = fromConfig ? fromConfig.is_terminal : value === "RESOLVIDO";
    const tone = ticketStatusTone(value, { isTerminal });
    return <Badge variant="outline" className={cn(STATUS_TONE_BADGE[tone])}>{label}</Badge>;
  }
  return <Badge variant={variants[value] || "info"}>{label}</Badge>;
}
