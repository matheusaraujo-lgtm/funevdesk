// Teste de fumaça ponta-a-ponta. Requer o servidor rodando em localhost:3000
// e o seed-demo aplicado. Uso: node scripts/e2e-smoke.mjs
const BASE = process.env.BASE || "http://localhost:3000";
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}
function cookieFrom(res) {
  const raw = res.headers.get("set-cookie") || "";
  const m = raw.match(/nexus_session=[^;]+/);
  return m ? m[0] : "";
}
async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, cookie: cookieFrom(res), body: await res.json().catch(() => ({})) };
}
const j = (cookie, extra = {}) => ({ headers: { cookie, "content-type": "application/json", ...extra } });

async function main() {
  console.log(`\n== E2E FunevDesk (${BASE}) ==\n`);

  // --- AUTENTICAÇÃO ---
  console.log("[Login]");
  const emp = await login("usuario@local", "Usuario@123");
  const tech = await login("tecnico@local", "Tecnico@123");
  const admin = await login("admin@local", "Admin@123");
  check("login usuário", emp.status === 200 && emp.cookie);
  check("login técnico", tech.status === 200 && tech.cookie);
  check("login admin", admin.status === 200 && admin.cookie);
  check("login senha errada → 401", (await login("usuario@local", "errada")).status === 401);

  // --- DASHBOARD POR PERFIL ---
  console.log("\n[Dashboard / dados por perfil]");
  const empDash = await (await fetch(`${BASE}/api/dashboard`, j(emp.cookie))).json();
  check("usuário recebe a própria máquina", (empDash.assets || []).some((a) => a.hostname === "NB-DEMO-001"));
  check("usuário NÃO vê dispositivos de rede", (empDash.networkDevices || []).length === 0);
  check("permissão canViewReports falsa p/ usuário", empDash.permissions?.canViewReports === false);
  const techDash = await (await fetch(`${BASE}/api/dashboard`, j(tech.cookie))).json();
  check("técnico vê chamados", Array.isArray(techDash.tickets));
  check("técnico canManageTickets", techDash.permissions?.canManageTickets === true);
  const adminDash = await (await fetch(`${BASE}/api/dashboard`, j(admin.cookie))).json();
  check("admin canConfigure", adminDash.permissions?.canConfigure === true);

  // --- BASE DE CONHECIMENTO (quick win) ---
  console.log("\n[Base de conhecimento no portal do usuário]");
  const kb = await fetch(`${BASE}/api/knowledge`, j(emp.cookie));
  const kbBody = await kb.json();
  check("usuário acessa KB (200)", kb.status === 200);
  check("KB tem o artigo semeado", (kbBody.articles || []).some((a) => /espaço/i.test(a.title)));

  // --- CONTROLE DE ACESSO / IDOR ---
  console.log("\n[Controle de acesso]");
  check("usuário em /api/settings → 403", (await fetch(`${BASE}/api/settings`, j(emp.cookie))).status === 403);
  check("usuário em /api/users → 401/403", [401, 403].includes((await fetch(`${BASE}/api/users`, j(emp.cookie))).status));
  check("usuário em /api/webhooks → 403", (await fetch(`${BASE}/api/webhooks`, j(emp.cookie))).status === 403);
  check("admin em /api/settings → 200", (await fetch(`${BASE}/api/settings`, j(admin.cookie))).status === 200);
  check("sem sessão em /api/dashboard → 401", (await fetch(`${BASE}/api/dashboard`)).status === 401);

  // --- CRIAÇÃO DE CHAMADO (fluxo usuário) ---
  console.log("\n[Abertura de chamado pelo usuário]");
  const catalog = await (await fetch(`${BASE}/api/catalog`, j(emp.cookie))).json();
  const list = catalog.catalog || catalog.types || [];
  const type = list.find((t) => t.active !== false) || list[0];
  let ticketId = null;
  if (type?.id) {
    const created = await fetch(`${BASE}/api/tickets`, { method: "POST", ...j(emp.cookie),
      body: JSON.stringify({ branchId: empDash.currentUser.branchId, ticketTypeId: type.id, title: "Teste E2E automático", description: "Chamado criado pelo teste de fumaça." }) });
    const cb = await created.json().catch(() => ({}));
    ticketId = cb.id;
    check("usuário cria chamado (201)", created.status === 201 && ticketId, JSON.stringify(cb).slice(0, 160));
  } else {
    check("catálogo possui tipo de chamado", false, "nenhum ticketType encontrado");
  }

  // --- XSS: sanitização de mensagem de chamado ---
  console.log("\n[XSS / sanitização]");
  if (ticketId) {
    const xss = '<img src=x onerror=alert(1)>Olá<script>alert(2)</script>';
    const msg = await fetch(`${BASE}/api/tickets/${ticketId}/messages`, { method: "POST", ...j(emp.cookie),
      body: JSON.stringify({ body: xss, visibility: "PUBLIC" }) });
    check("usuário envia mensagem (200/201)", [200, 201].includes(msg.status), `status ${msg.status}`);
    const detail = await (await fetch(`${BASE}/api/tickets/${ticketId}`, j(tech.cookie))).json();
    const blob = JSON.stringify(detail);
    check("onerror removido", !/onerror/i.test(blob));
    check("<script> removido", !/<script/i.test(blob));
  } else {
    check("XSS testável (precisa de chamado)", false);
  }

  // --- SSRF: webhook para destino interno deve ser bloqueado ---
  console.log("\n[SSRF / webhooks]");
  const ssrf = await fetch(`${BASE}/api/webhooks`, { method: "POST", ...j(admin.cookie),
    body: JSON.stringify({ name: "ssrf", url: "http://169.254.169.254/latest/meta-data/", events: ["TICKET_RESOLVED"], secret: "0123456789abcdef" }) });
  check("webhook p/ metadata interno → 400", ssrf.status === 400, `status ${ssrf.status}`);
  const okHook = await fetch(`${BASE}/api/webhooks`, { method: "POST", ...j(admin.cookie),
    body: JSON.stringify({ name: "ok", url: "https://example.com/webhook", events: ["TICKET_RESOLVED"], secret: "0123456789abcdef" }) });
  check("webhook público válido → 201", okHook.status === 201, `status ${okHook.status}`);
  const weakHook = await fetch(`${BASE}/api/webhooks`, { method: "POST", ...j(admin.cookie),
    body: JSON.stringify({ name: "weak", url: "https://example.com/webhook", events: ["TICKET_RESOLVED"], secret: "curto" }) });
  check("webhook com segredo fraco → 400", weakHook.status === 400, `status ${weakHook.status}`);

  // --- Rede: host inválido rejeitado ---
  console.log("\n[Monitor de rede / validação de host]");
  const badNet = await fetch(`${BASE}/api/network`, { method: "POST", ...j(admin.cookie),
    body: JSON.stringify({ branchId: adminDash.currentUser.branchId, name: "x", deviceType: "Switch", ipAddress: "-rf bad host", monitorType: "PING" }) });
  check("host inválido em /api/network → 400", badNet.status === 400, `status ${badNet.status}`);
  const okNet = await fetch(`${BASE}/api/network`, { method: "POST", ...j(admin.cookie),
    body: JSON.stringify({ branchId: adminDash.currentUser.branchId, name: "Switch Demo", deviceType: "Switch", ipAddress: "192.168.0.1", monitorType: "PING" }) });
  check("IP de LAN válido em /api/network → 201", okNet.status === 201, `status ${okNet.status}`);

  // --- Rate limiting no login ---
  console.log("\n[Rate limiting]");
  let got429 = false;
  for (let i = 0; i < 12; i++) {
    const r = await login("rate@test.local", "x");
    if (r.status === 429) { got429 = true; break; }
  }
  check("login bloqueia após muitas tentativas (429)", got429);

  console.log(`\n== Resultado: ${pass} passou, ${fail} falhou ==\n`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
