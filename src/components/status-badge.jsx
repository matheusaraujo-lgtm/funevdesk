import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isTicketStatusCode, statusColorStyle, STATUS_TONE_BADGE, ticketStatusTone } from "@/lib/status-colors";

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

// As situações são cadastráveis pelo usuário, então o rótulo pode ser tão longo quanto ele
// quiser. O <span> abaixo só reticencia quando quem chama limita a largura (max-w-full numa
// célula de tabela); solto, o badge continua com a largura natural (w-fit).
export function StatusBadge({ value, statuses, className }) {
  const fromConfig = statuses?.find((item) => item.code === value);
  const label = fromConfig?.label || labels[value] || value;
  const text = <span className="min-w-0 truncate">{label}</span>;
  // Status de chamado seguem a paleta padrão (verde/azul/amarelo/cinza); demais
  // (prioridade, SLA, ativo) mantêm os variants temáticos.
  if (isTicketStatusCode(value, statuses)) {
    // Cor personalizada da situação (hex ou tom nomeado) tem prioridade; senão cai na paleta padrão.
    const colorStyle = fromConfig?.color ? statusColorStyle(fromConfig.color) : null;
    if (colorStyle) {
      return <Badge variant="outline" title={label} className={cn("border", className)} style={colorStyle}>{text}</Badge>;
    }
    const isTerminal = fromConfig ? fromConfig.is_terminal : value === "RESOLVIDO";
    const tone = ticketStatusTone(value, { isTerminal });
    return <Badge variant="outline" title={label} className={cn(STATUS_TONE_BADGE[tone], className)}>{text}</Badge>;
  }
  return <Badge variant={variants[value] || "info"} title={label} className={className}>{text}</Badge>;
}
