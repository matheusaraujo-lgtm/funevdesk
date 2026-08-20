// AGENT 10 — Security Reviewer (qa/agents/10-security-reviewer.md)
// XSS em mensagens, SSRF em webhooks e rate-limit de login já têm cobertura real e
// funcionando em scripts/e2e-smoke.mjs — reaproveitado (rodado por qa/scripts/smoke.mjs),
// não duplicado aqui. Este script cobre o que ainda não tinha teste: IDOR de chamado por
// requester, e os atributos do cookie de sessão.
import { loginAs, api, createCollector, BASE } from "./lib/http.mjs";
import { saveEvidence } from "./lib/evidence.mjs";

async function main() {
  const c = createCollector("security");
  const admin = await loginAs("admin");
  const usuario = await loginAs("usuario");

  // --- Atributos do cookie de sessão ---
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "usuario@local", password: "Usuario@123" }),
  });
  const setCookie = loginRes.headers.get("set-cookie") || "";
  c.check("cookie de sessão é HttpOnly", /HttpOnly/i.test(setCookie) ? "PASS" : "FAIL", { detail: setCookie.replace(/nexus_session=[^;]+/, "nexus_session=<redacted>") });
  c.check("cookie de sessão tem SameSite", /SameSite/i.test(setCookie) ? "PASS" : "FAIL");
  const isProd = BASE.startsWith("https://");
  c.check(`cookie de sessão é Secure (esperado apenas se HTTPS; ambiente atual: ${isProd ? "https" : "http"})`,
    isProd ? (/Secure/i.test(setCookie) ? "PASS" : "FAIL") : "PASS");

  // --- IDOR: chamado de outro solicitante ---
  const dashAdmin = await api("GET", "/api/dashboard", { cookie: admin.cookie });
  const notMine = (dashAdmin.json?.tickets || []).find((t) => t.requester_id && t.requester_id !== usuario.body?.user?.id);
  if (notMine) {
    const res = await api("GET", `/api/tickets/${notMine.id}`, { cookie: usuario.cookie });
    c.check(`EMPLOYEE não acessa chamado #${notMine.number} de outro solicitante (IDOR)`, res.status === 403 ? "PASS" : "FAIL", { httpStatus: res.status });
  } else {
    c.inconclusive("IDOR de chamado por requester", "nenhum chamado de outro solicitante disponível no seed para testar");
  }

  // --- IDOR: perfil/usuário de outra organização não é acessível (checagem de forma, sem 2ª org no seed) ---
  // GET /api/users/[id] não existe (só PATCH/DELETE) -> Next responde 405 sem nenhum dado no
  // corpo, o que é seguro (nada vaza). 405 é um resultado aceitável aqui, não só 401/403/404.
  const fakeUserRes = await api("GET", "/api/users/usr_00000000000000000000000000000000", { cookie: usuario.cookie });
  const noDataLeaked = !fakeUserRes.json || Object.keys(fakeUserRes.json || {}).length === 0;
  c.check("EMPLOYEE não acessa detalhe de usuário (módulo users) mesmo com ID inventado", ([401, 403, 404, 405].includes(fakeUserRes.status) && noDataLeaked) ? "PASS" : "FAIL", { httpStatus: fakeUserRes.status, detail: fakeUserRes.status === 405 ? "GET não implementado nesta rota — nenhum dado no corpo" : undefined });

  // --- Mensagem de erro não vaza detalhe interno ---
  const malformedJson = await fetch(`${BASE}/api/tickets`, { method: "POST", headers: { cookie: usuario.cookie, "content-type": "application/json" }, body: "{ isso não é json" });
  const bodyText = await malformedJson.text();
  const leaksStack = /at\s+\S+\s+\(.*:\d+:\d+\)/.test(bodyText) || /node_modules/.test(bodyText);
  c.check("payload JSON malformado não vaza stack trace", !leaksStack ? "PASS" : "FAIL", { httpStatus: malformedJson.status, detail: bodyText.slice(0, 200) });

  const evidenceFile = saveEvidence("security", c.summary());
  const s = c.summary();
  console.log(`\n== Security: ${s.pass} PASS, ${s.fail} FAIL, ${s.inconclusive} INCONCLUSIVE ==`);
  console.log("Nota: XSS em mensagens, SSRF em webhooks e rate-limit de login são cobertos por scripts/e2e-smoke.mjs (rodado pela fase smoke, não duplicado aqui).");
  console.log(`Evidência: ${evidenceFile}`);
  process.exit(s.fail > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
