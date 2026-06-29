/**
 * Motor de inteligência do FunevDesk.
 *
 * Traduz sinais técnicos (telemetria de máquina, impressora, segurança) em
 * linguagem simples para uma TI com pouco conhecimento técnico: o que aconteceu,
 * o impacto provável e as ações recomendadas — além de severidade e prioridade.
 *
 * Esta é a camada DETERMINÍSTICA (regras). É rápida, gratuita e sempre disponível.
 * O cliente DeepSeek (lib/deepseek.js) usa estas regras como base e, quando há
 * chave configurada, enriquece o texto com raciocínio do modelo. Sem chave, o
 * sistema continua 100% funcional usando apenas estas regras.
 */

// Severidade → prioridade de chamado (alinha com as prioridades do catálogo).
export const SEVERITY_PRIORITY = {
  critica: "CRITICA",
  alta: "ALTA",
  media: "MEDIA",
  baixa: "BAIXA",
};

export const SEVERITY_LABEL = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n)}%` : "—";
}

function severityForMetric(value, { high, critical }) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= critical) return "critica";
  if (Number.isFinite(n) && n >= high) return "alta";
  return "media";
}

/**
 * Explica um sinal de telemetria de máquina (CPU, memória ou disco).
 * Retorna a estrutura padrão do motor: { signal, severity, titulo, resumo,
 * impacto, acoes[], priority }.
 */
export function explainTelemetry(signal, asset = {}, value) {
  const host = asset.hostname || "a máquina";
  const user = asset.logged_user ? ` (usuário ${asset.logged_user})` : "";

  switch (signal) {
    case "CPU_HIGH": {
      const severity = severityForMetric(value, { high: 90, critical: 97 });
      return finalize({
        signal,
        severity,
        titulo: `Processador sobrecarregado em ${host} (${pct(value)})`,
        resumo: `O processador de ${host}${user} está trabalhando em ${pct(value)}, quase no limite. Isso costuma deixar o computador lento e travando.`,
        impacto: "A pessoa pode estar enfrentando lentidão, travamentos ou programas que não respondem.",
        acoes: [
          "Verificar no Gerenciador de Tarefas qual programa está consumindo a CPU.",
          "Fechar ou reiniciar o programa identificado.",
          "Se persistir, reiniciar a máquina e checar atualizações pendentes ou possível vírus.",
        ],
      });
    }
    case "MEMORY_HIGH": {
      const severity = severityForMetric(value, { high: 90, critical: 97 });
      return finalize({
        signal,
        severity,
        titulo: `Memória quase esgotada em ${host} (${pct(value)})`,
        resumo: `A memória (RAM) de ${host}${user} está em ${pct(value)} de uso. Com pouca memória livre, o computador fica lento e pode fechar programas sozinho.`,
        impacto: "Programas podem ficar lentos, congelar ou fechar inesperadamente, com risco de perda de trabalho não salvo.",
        acoes: [
          "Pedir para a pessoa salvar o trabalho aberto.",
          "Fechar abas do navegador e programas que não estão em uso.",
          "Reiniciar a máquina para liberar memória; se for recorrente, avaliar upgrade de RAM.",
        ],
      });
    }
    case "DISK_HIGH": {
      const severity = severityForMetric(value, { high: 90, critical: 96 });
      return finalize({
        signal,
        severity,
        titulo: `Disco quase cheio em ${host} (${pct(value)})`,
        resumo: `O disco de ${host}${user} está em ${pct(value)} de uso. Quando o disco enche, o Windows trava, não atualiza e pode corromper arquivos.`,
        impacto: "Risco de a máquina não atualizar, travar ao salvar arquivos e perder dados.",
        acoes: [
          "Esvaziar a Lixeira e limpar a pasta de arquivos temporários.",
          "Remover arquivos grandes e antigos (downloads, vídeos, instaladores).",
          "Se continuar cheio, avaliar limpeza de disco programada ou troca por um disco maior.",
        ],
      });
    }
    default:
      return finalize({
        signal: signal || "DESCONHECIDO",
        severity: "media",
        titulo: `Alerta de monitoramento em ${host}`,
        resumo: `O monitoramento detectou um sinal em ${host}${user} que precisa de atenção da equipe.`,
        impacto: "Impacto a ser avaliado pela equipe de suporte.",
        acoes: ["Revisar os indicadores da máquina no painel de saúde."],
      });
  }
}

/**
 * Explica um sinal de impressora (toner baixo, offline, atolamento, etc.).
 * `detail` é um texto livre vindo do monitor (ex.: "Toner Preto 4%").
 */
export function explainPrinter(signal, device = {}, detail = "") {
  const name = device.hostname || device.name || "a impressora";
  const where = device.ip_address ? ` (${device.ip_address})` : "";
  const extra = detail ? ` ${detail}.` : "";

  switch (signal) {
    case "supplyLow":
      return finalize({
        signal,
        severity: "media",
        titulo: `Suprimento baixo em ${name}`,
        resumo: `A impressora ${name}${where} está com suprimento abaixo do limite.${extra} Em breve ela pode parar de imprimir.`,
        impacto: "A impressão pode falhar ou sair com baixa qualidade até a troca do insumo.",
        acoes: [
          "Verificar o nível de toner/cilindro no painel da impressora.",
          "Providenciar e instalar o insumo de reposição.",
          "Confirmar se há estoque do insumo na unidade.",
        ],
      });
    case "jammed":
      return finalize({
        signal,
        severity: "alta",
        titulo: `Atolamento de papel em ${name}`,
        resumo: `A impressora ${name}${where} relatou atolamento de papel.${extra} Ela não vai imprimir até ser liberada.`,
        impacto: "Ninguém consegue imprimir nessa impressora enquanto o papel preso não for removido.",
        acoes: [
          "Abrir as tampas e remover com cuidado o papel preso.",
          "Conferir se ficou nenhum pedaço de papel na passagem.",
          "Reiniciar a impressora e fazer um teste de impressão.",
        ],
      });
    case "offline":
    case "unreachable":
      return finalize({
        signal,
        severity: "alta",
        titulo: `${name} fora do ar`,
        resumo: `A impressora ${name}${where} não está respondendo na rede.${extra} Pode estar desligada, sem rede ou com problema.`,
        impacto: "A impressora está indisponível para todos os usuários da unidade.",
        acoes: [
          "Verificar se a impressora está ligada e com cabo de rede conectado.",
          "Conferir o IP/rede e se ela aparece no painel.",
          "Reiniciar a impressora; se não voltar, acionar a assistência.",
        ],
      });
    default:
      return finalize({
        signal: signal || "printer",
        severity: "media",
        titulo: `Atenção na impressora ${name}`,
        resumo: `O monitoramento reportou um evento em ${name}${where}.${extra}`,
        impacto: "Impacto a ser avaliado pela equipe de suporte.",
        acoes: ["Verificar o estado da impressora no painel de impressoras."],
      });
  }
}

/**
 * Explica um sinal de segurança (XDR/EPP) — malware, comportamento suspeito, etc.
 */
export function explainSecurity(signal, asset = {}, detail = "") {
  const host = asset.hostname || "a máquina";
  const extra = detail ? ` ${detail}.` : "";
  return finalize({
    signal: signal || "SECURITY",
    severity: "critica",
    titulo: `Ameaça de segurança detectada em ${host}`,
    resumo: `A proteção de segurança identificou uma possível ameaça em ${host}.${extra} É preciso agir rápido para conter.`,
    impacto: "Risco de comprometimento de dados, propagação para outras máquinas e indisponibilidade.",
    acoes: [
      "Isolar a máquina da rede até a análise (desconectar do Wi-Fi/cabo).",
      "Executar uma varredura completa com o antivírus/EPP.",
      "Trocar as senhas usadas nessa máquina e avaliar restauração se houver dano.",
    ],
  });
}

const PRIORITY_SEVERITY = { CRITICA: "critica", ALTA: "alta", MEDIA: "media", BAIXA: "baixa" };

// Remove tags HTML para uso em prompt/resumo de texto.
export function stripHtml(html = "") {
  return String(html).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Explicação base genérica para QUALQUER chamado (inclusive abertos por humanos),
 * derivada do título/descrição/prioridade. É o fallback quando não há sinal de
 * telemetria nem DeepSeek disponível.
 */
export function explainGeneric(ticket = {}) {
  const severity = PRIORITY_SEVERITY[ticket.priority] || "media";
  const resumoBase = stripHtml(ticket.description || "");
  return finalize({
    signal: "TICKET",
    severity,
    titulo: ticket.title || "Chamado",
    resumo: resumoBase
      ? `Resumo do chamado: ${resumoBase.slice(0, 280)}${resumoBase.length > 280 ? "…" : ""}`
      : "Este chamado não tem descrição detalhada. Avalie com o solicitante o que está acontecendo.",
    impacto: "Impacto a confirmar com o solicitante.",
    acoes: [
      "Confirmar com o solicitante o problema e quando começou.",
      "Reproduzir/observar o comportamento relatado.",
      "Aplicar a correção e validar com o solicitante antes de encerrar.",
    ],
  });
}

// Garante o formato final consistente e deriva a prioridade da severidade.
function finalize(insight) {
  const severity = SEVERITY_PRIORITY[insight.severity] ? insight.severity : "media";
  return {
    ...insight,
    severity,
    severityLabel: SEVERITY_LABEL[severity],
    priority: SEVERITY_PRIORITY[severity],
    acoes: Array.isArray(insight.acoes) ? insight.acoes.filter(Boolean) : [],
  };
}

/**
 * Monta a descrição de chamado em linguagem simples a partir de um insight do
 * motor. Usado pelos fluxos automáticos (telemetria, impressora, segurança).
 */
export function insightToTicketDescription(insight, context = {}) {
  const lines = [];
  lines.push(`🔎 O que aconteceu`);
  lines.push(insight.resumo);
  lines.push("");
  if (insight.impacto) {
    lines.push(`⚠️ Possível impacto`);
    lines.push(insight.impacto);
    lines.push("");
  }
  if (insight.acoes?.length) {
    lines.push(`✅ O que fazer`);
    insight.acoes.forEach((acao, i) => lines.push(`${i + 1}. ${acao}`));
    lines.push("");
  }
  const ctx = [];
  if (context.hostname) ctx.push(`Equipamento: ${context.hostname}`);
  if (context.logged_user) ctx.push(`Usuário: ${context.logged_user}`);
  if (context.ip_address) ctx.push(`IP: ${context.ip_address}`);
  if (context.metric) ctx.push(`Medição: ${context.metric}`);
  if (ctx.length) {
    lines.push(`🖥️ Detalhes técnicos`);
    lines.push(ctx.join(" · "));
  }
  lines.push("");
  lines.push(`Severidade: ${insight.severityLabel} · Gerado automaticamente pelo Motor de Inteligência do FunevDesk.`);
  return lines.join("\n").trim();
}
