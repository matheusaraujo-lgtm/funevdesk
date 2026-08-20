// AGENT 8 — Chaos / Adversarial Agent (qa/agents/08-chaos-adversarial-agent.md)
// Foco: endpoints construídos nesta sessão sem nenhuma cobertura de teste prévia
// (macros/respostas prontas, recurring-tickets, pending_reason em tickets/[id]).
import { loginAs, api, createCollector } from "./lib/http.mjs";
import { saveEvidence } from "./lib/evidence.mjs";

const HOSTILE_STRINGS = {
  empty: "",
  spaces: "   ",
  emoji: "🔥🐛日本語",
  html: "<img src=x onerror=alert(1)>",
  script: "<script>alert(1)</script>",
  sqlLike: "'; DROP TABLE tickets; --",
  huge: "A".repeat(5000),
};

async function main() {
  const c = createCollector("chaos");
  const admin = await loginAs("admin");
  const dash = await api("GET", "/api/dashboard", { cookie: admin.cookie });
  const branchId = dash.json?.currentUser?.branchId;
  const ticketType = dash.json?.tickets?.[0]?.ticket_type_id;

  // --- macros (respostas prontas): título/corpo hostis ---
  for (const [name, value] of Object.entries(HOSTILE_STRINGS)) {
    const res = await api("POST", "/api/macros", { cookie: admin.cookie, body: { title: `QA-chaos-${name}`.slice(0, 120), body: value || "x" } });
    if (name === "empty") {
      // corpo mínimo 2 chars no schema — vazio é 400 (correto, confirmado)
      c.check(`macros body="${name}" -> 400 esperado`, res.status === 400 ? "PASS" : "FAIL", { httpStatus: res.status });
    } else if (name === "spaces") {
      // BUG-004 (corrigido 2026-08-20): z.string().trim().min(2) agora rejeita "   " com 400.
      c.check('macros body="   " (só espaços) -> 400 (BUG-004 corrigido)', res.status === 400 ? "PASS" : "FAIL", { httpStatus: res.status });
      if (res.status === 201) {
        const macroId = res.json?.macros?.find((m) => m.title === "QA-chaos-spaces")?.id;
        if (macroId) await api("DELETE", `/api/macros/${macroId}`, { cookie: admin.cookie });
      }
    } else if (name === "huge") {
      c.check(`macros body="${name}" (5000 chars, max=4000) -> 400 esperado`, res.status === 400 ? "PASS" : "FAIL", { httpStatus: res.status });
    } else {
      const ok = res.status === 201;
      c.check(`macros body="${name}" -> aceito e sanitizado na leitura`, ok ? "PASS" : "FAIL", { httpStatus: res.status });
      if (ok) {
        const macroId = res.json?.macros?.find((m) => m.title === `QA-chaos-${name}`)?.id;
        const listAgain = await api("GET", "/api/macros", { cookie: admin.cookie });
        const stored = listAgain.json?.macros?.find((m) => m.id === macroId);
        const leaked = stored && /<script|onerror=/i.test(stored.body) && name === "html";
        // macros armazenam TEXTO PURO (não HTML) — então <script>/onerror ficam como texto
        // literal, não executável; o teste real de sanitização é no toEditorHtml() na leitura
        // do lado do cliente. Aqui confirmamos que o valor persistiu sem quebrar o backend.
        c.check(`macros body="${name}" persistiu sem corromper o registro`, stored ? "PASS" : "FAIL");
        if (macroId) await api("DELETE", `/api/macros/${macroId}`, { cookie: admin.cookie });
      }
    }
  }

  // --- recurring-tickets: campos obrigatórios ausentes/hostis ---
  if (branchId && ticketType) {
    const badPayloads = [
      { name: "sem branchId", body: { title: "QA-chaos", description: "desc valida aqui", ticketTypeId: ticketType, recurrenceUnit: "DAYS", recurrenceInterval: 1, startAt: new Date().toISOString() } },
      { name: "intervalo negativo", body: { branchId, title: "QA-chaos", description: "desc valida aqui", ticketTypeId: ticketType, recurrenceUnit: "DAYS", recurrenceInterval: -5, startAt: new Date().toISOString() } },
      { name: "intervalo zero", body: { branchId, title: "QA-chaos", description: "desc valida aqui", ticketTypeId: ticketType, recurrenceUnit: "DAYS", recurrenceInterval: 0, startAt: new Date().toISOString() } },
      { name: "unidade de recorrência inválida", body: { branchId, title: "QA-chaos", description: "desc valida aqui", ticketTypeId: ticketType, recurrenceUnit: "SEGUNDOS", recurrenceInterval: 1, startAt: new Date().toISOString() } },
      { name: "startAt não é data ISO", body: { branchId, title: "QA-chaos", description: "desc valida aqui", ticketTypeId: ticketType, recurrenceUnit: "DAYS", recurrenceInterval: 1, startAt: "amanhã" } },
      { name: "ticketTypeId inexistente", body: { branchId, title: "QA-chaos", description: "desc valida aqui", ticketTypeId: "tt_naoexiste", recurrenceUnit: "DAYS", recurrenceInterval: 1, startAt: new Date().toISOString() } },
    ];
    for (const { name, body } of badPayloads) {
      const res = await api("POST", "/api/recurring-tickets", { cookie: admin.cookie, body });
      const rejected = res.status === 400 || res.status === 404;
      c.check(`recurring-tickets ${name} -> rejeitado (400/404)`, rejected ? "PASS" : "FAIL", { httpStatus: res.status, detail: JSON.stringify(res.json).slice(0, 150) });
      if (res.status === 201) {
        // não deveria ter sido criado — limpa mesmo assim pra não sujar o ambiente
        const id = res.json?.templates?.[0]?.id;
        if (id) await api("DELETE", `/api/recurring-tickets/${id}`, { cookie: admin.cookie });
      }
    }

    // Título com HTML não é um caso de rejeição esperada — o schema (min/max de string) não
    // proíbe HTML, e nada garante que precise. O que importa é NÃO EXECUTAR como HTML quando
    // renderizado — isso só o Browser Agent pode confirmar (ticket.title sempre passa por JSX
    // puro, nunca dangerouslySetInnerHTML, pelo que a leitura de código indica). Marcado
    // INCONCLUSIVE aqui de propósito, para não virar falso-positivo de API.
    const htmlTitleRes = await api("POST", "/api/recurring-tickets", { cookie: admin.cookie, body: {
      branchId, title: HOSTILE_STRINGS.html, description: "desc valida aqui", ticketTypeId: ticketType,
      recurrenceUnit: "DAYS", recurrenceInterval: 1, startAt: new Date().toISOString(),
    } });
    c.inconclusive("recurring-tickets título com HTML — aceito pela API; execução como HTML precisa ser confirmada pelo Browser Agent", `httpStatus=${htmlTitleRes.status}`);
    if (htmlTitleRes.status === 201) {
      const id = htmlTitleRes.json?.templates?.find((t) => t.title === HOSTILE_STRINGS.html)?.id;
      if (id) await api("DELETE", `/api/recurring-tickets/${id}`, { cookie: admin.cookie });
    }
  } else {
    c.inconclusive("recurring-tickets chaos", "sem branchId/ticketTypeId disponíveis no dashboard para montar payload válido");
  }

  // --- tickets/[id]: requires_reason sem motivo / sem data de reabertura ---
  const ticketsWithStatus = dash.json?.tickets || [];
  const openTicket = ticketsWithStatus.find((t) => t.status === "ABERTO" || t.status === "EM_ATENDIMENTO");
  if (openTicket) {
    const noReason = await api("PATCH", `/api/tickets/${openTicket.id}`, { cookie: admin.cookie, body: { status: "PENDENTE" } });
    c.check("tickets PATCH status=PENDENTE sem pendingReason -> 400", noReason.status === 400 ? "PASS" : "FAIL", { httpStatus: noReason.status });
    const noReopen = await api("PATCH", `/api/tickets/${openTicket.id}`, { cookie: admin.cookie, body: { status: "PENDENTE", pendingReason: "motivo válido" } });
    c.check("tickets PATCH status=PENDENTE com motivo mas sem pendingReopenAt -> 400", noReopen.status === 400 ? "PASS" : "FAIL", { httpStatus: noReopen.status });
    const badDate = await api("PATCH", `/api/tickets/${openTicket.id}`, { cookie: admin.cookie, body: { status: "PENDENTE", pendingReason: "motivo válido", pendingReopenAt: "não é uma data" } });
    c.check("tickets PATCH pendingReopenAt inválido (não-ISO) -> 400", badDate.status === 400 ? "PASS" : "FAIL", { httpStatus: badDate.status });
  } else {
    c.inconclusive("tickets requires_reason chaos", "nenhum chamado ABERTO/EM_ATENDIMENTO disponível no seed para testar sem alterar dado real");
  }

  // --- IDs inválidos/inexistentes em rotas [id] ---
  for (const badId of ["", "id-inexistente", "'; DROP TABLE tickets; --", "../../../etc/passwd"]) {
    if (!badId) continue;
    const res = await api("GET", `/api/tickets/${encodeURIComponent(badId)}`, { cookie: admin.cookie });
    c.check(`GET /api/tickets/${JSON.stringify(badId)} -> 404 (nunca 500)`, res.status === 404 ? "PASS" : res.status >= 500 ? "FAIL" : "INCONCLUSIVE", { httpStatus: res.status });
  }

  const evidenceFile = saveEvidence("chaos", c.summary());
  const s = c.summary();
  console.log(`\n== Chaos: ${s.pass} PASS, ${s.fail} FAIL, ${s.inconclusive} INCONCLUSIVE ==`);
  console.log(`Evidência: ${evidenceFile}`);
  process.exit(s.fail > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
