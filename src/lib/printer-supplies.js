// Traduz o nome do suprimento de impressora (vem via SNMP, normalmente em inglês).
// Usado tanto na UI quanto na mensagem de erro do monitoramento.
export function translateSupply(name) {
  if (!name) return "Suprimento";
  const n = String(name).trim();
  const color = /black|preto/i.test(n) ? "Preto"
    : /cyan|ciano/i.test(n) ? "Ciano"
    : /magenta/i.test(n) ? "Magenta"
    : /yellow|amarelo/i.test(n) ? "Amarelo" : "";
  let part = "";
  if (/drum/i.test(n)) part = "Cilindro";
  else if (/waste/i.test(n)) part = "Toner residual";
  else if (/transfer\s*belt/i.test(n)) part = "Correia de transferência";
  else if (/belt/i.test(n)) part = "Correia";
  else if (/fuser/i.test(n)) part = "Fusor";
  else if (/imaging/i.test(n)) part = "Unidade de imagem";
  else if (/maintenance/i.test(n)) part = "Kit de manutenção";
  else if (/ink/i.test(n)) part = "Tinta";
  else if (/toner/i.test(n)) part = "Toner";
  else return n; // desconhecido: mantém o nome original
  return color ? `${part} ${color}` : part;
}
