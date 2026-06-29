/**
 * Cliente DeepSeek do FunevDesk.
 *
 * DeepSeek é compatível com a API da OpenAI. Usamos o modelo `deepseek-chat`
 * (V3) — o mais barato e atual para esta finalidade. A chave vem da variável
 * de ambiente DEEPSEEK_API_KEY.
 *
 * Princípio de projeto: o sistema NUNCA depende da IA para funcionar. O motor
 * de regras (lib/intelligence.js) sempre produz uma explicação válida. O
 * DeepSeek apenas REFINA esse texto quando disponível. Qualquer erro, timeout
 * ou ausência de chave faz o sistema voltar ao texto das regras sem quebrar.
 */

import {
  explainTelemetry,
  explainPrinter,
  explainSecurity,
  explainGeneric,
  stripHtml,
  SEVERITY_PRIORITY,
  SEVERITY_LABEL,
} from "@/lib/intelligence";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const TIMEOUT_MS = 12000;

export function isDeepSeekConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

const SYSTEM_PROMPT = `Você é o analista de suporte técnico do FunevDesk, um sistema de chamados de TI.
Seu público é uma equipe de TI com POUCO conhecimento técnico. Traduza sinais técnicos em
linguagem simples, direta e sem jargão. Seja prático e objetivo.

Responda SEMPRE em português do Brasil e SEMPRE com um JSON válido (sem markdown, sem cercas de código)
exatamente neste formato:
{
  "titulo": "string curta, até 80 caracteres",
  "resumo": "2-3 frases explicando o que está acontecendo, em linguagem simples",
  "impacto": "1-2 frases sobre o impacto para o usuário/operação",
  "acoes": ["ação 1", "ação 2", "ação 3"],
  "severity": "critica" | "alta" | "media" | "baixa"
}`;

/**
 * Chama o DeepSeek com um prompt e tenta extrair o JSON do insight.
 * Retorna null em qualquer falha (sem chave, erro de rede, timeout, JSON inválido).
 */
async function callDeepSeek(userPrompt) {
  if (!isDeepSeekConfigured()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (!parsed?.titulo || !parsed?.resumo) return null;
    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Mescla o insight base (regras) com o refinamento do modelo, mantendo o formato.
function mergeInsight(base, ai) {
  if (!ai) return { ...base, source: "rules" };
  const severity = SEVERITY_PRIORITY[ai.severity] ? ai.severity : base.severity;
  return {
    ...base,
    titulo: ai.titulo || base.titulo,
    resumo: ai.resumo || base.resumo,
    impacto: ai.impacto || base.impacto,
    acoes: Array.isArray(ai.acoes) && ai.acoes.length ? ai.acoes.filter(Boolean) : base.acoes,
    severity,
    severityLabel: SEVERITY_LABEL[severity],
    priority: SEVERITY_PRIORITY[severity],
    source: "deepseek",
  };
}

/**
 * Explica um sinal de telemetria, refinando com DeepSeek quando disponível.
 * `value` é a medição (ex.: 94 para CPU 94%).
 */
export async function explainTelemetryAI(signal, asset = {}, value) {
  const base = explainTelemetry(signal, asset, value);
  const ai = await callDeepSeek(
    `Sinal de telemetria: ${signal}. Equipamento: ${asset.hostname || "—"}. ` +
      `Usuário logado: ${asset.logged_user || "—"}. Medição atual: ${value}%. ` +
      `Sistema operacional: ${asset.os_name || "—"}. ` +
      `Explique para a equipe de suporte o que está acontecendo e o que fazer.`
  );
  return mergeInsight(base, ai);
}

/** Explica um sinal de impressora, refinando com DeepSeek quando disponível. */
export async function explainPrinterAI(signal, device = {}, detail = "") {
  const base = explainPrinter(signal, device, detail);
  const ai = await callDeepSeek(
    `Evento de impressora: ${signal}. Impressora: ${device.hostname || device.name || "—"}. ` +
      `IP: ${device.ip_address || "—"}. Detalhe do monitor: ${detail || "—"}. ` +
      `Explique para a equipe de suporte o que está acontecendo e o que fazer.`
  );
  return mergeInsight(base, ai);
}

/** Explica um sinal de segurança (XDR/EPP), refinando com DeepSeek quando disponível. */
export async function explainSecurityAI(signal, asset = {}, detail = "") {
  const base = explainSecurity(signal, asset, detail);
  const ai = await callDeepSeek(
    `Alerta de segurança (XDR/EPP): ${signal}. Equipamento: ${asset.hostname || "—"}. ` +
      `Detalhe: ${detail || "—"}. Explique o risco para a equipe e as ações de contenção.`
  );
  return mergeInsight(base, ai);
}

// Detecta o pior sinal de telemetria num chamado (se houver métricas altas).
function telemetrySignalFromTicket(ticket) {
  const cpu = Number(ticket.cpu_percent);
  const mem = Number(ticket.memory_percent);
  const disk = Number(ticket.disk_percent);
  const candidates = [
    { signal: "CPU_HIGH", value: cpu, min: 90 },
    { signal: "MEMORY_HIGH", value: mem, min: 90 },
    { signal: "DISK_HIGH", value: disk, min: 90 },
  ].filter((c) => Number.isFinite(c.value) && c.value >= c.min);
  candidates.sort((a, b) => b.value - a.value);
  return candidates[0] || null;
}

/**
 * Explica um chamado sob demanda (botão "Explicar / Como resolver").
 * Funciona para qualquer chamado: usa telemetria quando há sinal alto, senão
 * uma base genérica do título/descrição — e refina com DeepSeek se disponível.
 */
export async function explainTicketAI(ticket = {}, asset = {}) {
  const tele = telemetrySignalFromTicket({ ...ticket, ...asset });
  const base = tele
    ? explainTelemetry(tele.signal, { ...ticket, ...asset }, tele.value)
    : explainGeneric(ticket);

  const ctx = [
    `Título: ${ticket.title || "—"}`,
    ticket.category ? `Categoria: ${ticket.category}` : "",
    ticket.priority ? `Prioridade atual: ${ticket.priority}` : "",
    ticket.description ? `Descrição: ${stripHtml(ticket.description).slice(0, 600)}` : "",
    (asset.hostname || ticket.hostname) ? `Equipamento: ${asset.hostname || ticket.hostname}` : "",
    tele ? `Telemetria: CPU ${ticket.cpu_percent ?? asset.cpu_percent ?? "—"}%, memória ${ticket.memory_percent ?? asset.memory_percent ?? "—"}%, disco ${ticket.disk_percent ?? asset.disk_percent ?? "—"}%` : "",
  ].filter(Boolean).join("\n");

  const ai = await callDeepSeek(
    `Analise este chamado de TI e explique para a equipe de suporte (pouco conhecimento técnico) ` +
      `o que provavelmente está acontecendo, o impacto e o passo a passo para resolver.\n\n${ctx}`
  );
  return mergeInsight(base, ai);
}

/**
 * Pergunta livre ao analista (usado por um endpoint sob demanda). Retorna o
 * texto da resposta ou null se a IA não estiver disponível.
 */
export async function askAnalyst(question, context = "") {
  if (!isDeepSeekConfigured()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "Você é o analista de suporte do FunevDesk. Responda em português do Brasil, " +
              "em linguagem simples para uma TI com pouco conhecimento técnico. Seja direto e prático.",
          },
          { role: "user", content: context ? `${context}\n\nPergunta: ${question}` : question },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
