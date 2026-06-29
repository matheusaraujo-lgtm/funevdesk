// Rótulos amigáveis (pt-BR) para os códigos de evento de webhook.
// Os códigos (chaves) são os valores enviados ao backend e NÃO devem mudar.
export const WEBHOOK_EVENT_LABELS = {
  TICKET_NEW: "Novo chamado",
  TICKET_RESOLVED: "Chamado resolvido",
  TICKET_ASSIGNED: "Chamado atribuído",
  TICKET_MESSAGE: "Nova mensagem no chamado",
  CHANGE_CREATED: "Mudança criada",
  PROBLEM_CREATED: "Problema criado",
};

// Retorna o rótulo amigável de um código; cai para o próprio código se desconhecido.
export function eventLabel(code) {
  return WEBHOOK_EVENT_LABELS[code] || code;
}
