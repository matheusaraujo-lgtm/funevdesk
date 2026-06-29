// Fonte única das cores de status de chamado em toda a aplicação:
//   Aberto → verde · Em atendimento → azul · Pendente → amarelo · Encerrado/Resolvido → cinza.
// Status intermediário customizado (sem código conhecido) cai em azul.

const TICKET_STATUS_CODES = ["ABERTO", "EM_ATENDIMENTO", "PENDENTE", "RESOLVIDO", "CANCELADO", "ENCERRADO", "FINALIZADO"];

export function isTicketStatusCode(value, statuses) {
  if (statuses?.some((item) => item.code === value)) return true;
  return TICKET_STATUS_CODES.includes(value);
}

export function ticketStatusTone(code, { isTerminal = false } = {}) {
  if (isTerminal) return "gray";
  switch (code) {
    case "ABERTO": return "green";
    case "EM_ATENDIMENTO": return "blue";
    case "PENDENTE": return "amber";
    case "RESOLVIDO":
    case "CANCELADO":
    case "ENCERRADO":
    case "FINALIZADO": return "gray";
    default: return "blue";
  }
}

// Classes para a pílula (com borda) usada no cabeçalho do chamado.
export const STATUS_TONE_PILL = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  gray: "border-border bg-muted text-muted-foreground",
};

// Classes para o badge arredondado (sem borda) usado em listas e na lateral.
export const STATUS_TONE_BADGE = {
  green: "border-transparent bg-emerald-50 text-emerald-700",
  blue: "border-transparent bg-blue-50 text-blue-700",
  amber: "border-transparent bg-amber-50 text-amber-700",
  gray: "border-transparent bg-muted text-muted-foreground",
};
