// Testa as features da Fase 3 ponta-a-ponta. Servidor em :3000 + seed-demo aplicado.
const BASE = process.env.BASE || "http://localhost:3000";
let pass = 0, fail = 0;
const check = (n, c, x = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${x}`); } };
const cookieOf = (r) => (r.headers.get("set-cookie") || "").match(/nexus_session=[^;]+/)?.[0] || "";
async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  return { status: r.status, cookie: cookieOf(r) };
}
const J = (c, extra = {}) => ({ headers: { cookie: c, "content-type": "application/json", ...extra } });

async function main() {
  console.log(`\n== E2E Fase 3 (${BASE}) ==\n`);
  const admin = await login("admin@local", "Admin@123");
  const dash = await (await fetch(`${BASE}/api/dashboard`, J(admin.cookie))).json();
  const branchId = dash.currentUser.branchId;

  console.log("[Esqueci minha senha]");
  const fp = await fetch(`${BASE}/api/auth/forgot-password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "usuario@local" }) });
  const fpBody = await fp.json();
  check("forgot-password retorna 200 genérico", fp.status === 200 && /existir/i.test(fpBody.message || ""));
  const fpUnknown = await fetch(`${BASE}/api/auth/forgot-password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "naoexiste@x.y" }) });
  check("e-mail inexistente: mesma resposta (anti-enumeração)", fpUnknown.status === 200);
  const notif = await (await fetch(`${BASE}/api/notifications`, J(admin.cookie))).json();
  check("admin recebeu notificação de pedido de senha", (notif.notifications || notif.items || []).some((n) => /senha|redefini/i.test(`${n.title} ${n.body}`)), JSON.stringify(notif).slice(0, 120));

  console.log("\n[Localizações: criar/editar/excluir]");
  const created = await fetch(`${BASE}/api/locations`, { method: "POST", ...J(admin.cookie), body: JSON.stringify({ branchId, name: "Sala Teste E2E", code: "ST1" }) });
  check("cria localização (200/201)", [200, 201].includes(created.status));
  const list1 = await (await fetch(`${BASE}/api/locations`, J(admin.cookie))).json();
  const loc = (list1.locations || []).find((l) => l.name === "Sala Teste E2E");
  check("localização aparece na lista", Boolean(loc));
  if (loc) {
    const patched = await fetch(`${BASE}/api/locations/${loc.id}`, { method: "PATCH", ...J(admin.cookie), body: JSON.stringify({ name: "Sala Renomeada E2E" }) });
    check("edita localização (PATCH 200)", patched.status === 200);
    const del = await fetch(`${BASE}/api/locations/${loc.id}`, { method: "DELETE", ...J(admin.cookie) });
    check("exclui localização (DELETE 200)", del.status === 200);
  }

  console.log("\n[Auditoria: paginação]");
  const audit = await fetch(`${BASE}/api/audit?page=1&limit=5`, J(admin.cookie));
  const auditBody = await audit.json();
  check("auditoria paginada responde 200", audit.status === 200);
  check("retorna no máx. 5 itens na página", Array.isArray(auditBody.logs || auditBody.entries || auditBody.items) && (auditBody.logs || auditBody.entries || auditBody.items).length <= 5, Object.keys(auditBody).join(","));

  console.log("\n[Relatórios: período]");
  const rep = await fetch(`${BASE}/api/reports?period=30d`, J(admin.cookie));
  check("relatórios com período responde 200", rep.status === 200);
  const repBad = await fetch(`${BASE}/api/reports?period=xx`, J(admin.cookie));
  check("período inválido rejeitado (400)", repBad.status === 400, `status ${repBad.status}`);

  console.log("\n[Estoque: entrada e saída com quantidade]");
  const itm = await fetch(`${BASE}/api/inventory`, { method: "POST", ...J(admin.cookie), body: JSON.stringify({ branchId, name: "Item E2E", quantity: 10, minQuantity: 2 }) });
  const itmBody = await itm.json().catch(() => ({}));
  const itemId = itmBody.id;
  check("cria item de estoque", [200, 201].includes(itm.status) && itemId, JSON.stringify(itmBody).slice(0, 120));
  if (itemId) {
    const outMov = await fetch(`${BASE}/api/inventory/${itemId}`, { method: "POST", ...J(admin.cookie), body: JSON.stringify({ movementType: "SAIDA", quantity: 3 }) });
    check("registra SAÍDA com quantidade (200)", [200, 201].includes(outMov.status), `status ${outMov.status}`);
    const list = await (await fetch(`${BASE}/api/inventory`, J(admin.cookie))).json();
    const item = (list.items || []).find((i) => i.id === itemId);
    check("saldo reduzido após saída (10-3=7)", item && Number(item.quantity) === 7, item ? `saldo=${item.quantity}` : "item sumiu");
  }

  console.log("\n[Transição de status do chamado]");
  const tk = await (await fetch(`${BASE}/api/dashboard`, J(admin.cookie))).json();
  const ticket = (tk.tickets || []).find((t) => t.status !== "RESOLVIDO");
  if (ticket) {
    const mv = await fetch(`${BASE}/api/tickets/${ticket.id}`, { method: "PATCH", ...J(admin.cookie), body: JSON.stringify({ status: "EM_ATENDIMENTO" }) });
    check("muda status para EM_ATENDIMENTO (200)", mv.status === 200, `status ${mv.status}`);
  } else check("havia chamado não-resolvido para testar", false);

  console.log(`\n== Fase 3: ${pass} passou, ${fail} falhou ==\n`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
