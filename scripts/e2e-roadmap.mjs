// Testa os itens do roadmap: hash de tokens, telemetria em série temporal, ingestão XDR.
// Servidor em :3000 com XDR_INGEST_SECRET definido + seed-demo aplicado.
const BASE = process.env.BASE || "http://localhost:3000";
const XDR_SECRET = process.env.XDR_INGEST_SECRET || "test-xdr-secret";
let pass = 0, fail = 0;
const check = (n, c, x = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${x}`); } };
const cookieOf = (r) => (r.headers.get("set-cookie") || "").match(/nexus_session=[^;]+/)?.[0] || "";
async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  return { status: r.status, cookie: cookieOf(r) };
}
const J = (c, extra = {}) => ({ headers: { cookie: c, "content-type": "application/json", ...extra } });

async function main() {
  console.log(`\n== E2E Roadmap (${BASE}) ==\n`);
  const admin = await login("admin@local", "Admin@123");
  const dash = await (await fetch(`${BASE}/api/dashboard`, J(admin.cookie))).json();
  const asset = (dash.assets || []).find((a) => a.hostname === "NB-DEMO-001") || (dash.assets || [])[0];
  const orgSlug = dash.currentUser.organizationSlug;

  console.log("[Hash de tokens de agente]");
  // Settings não expõe token em claro
  const settings = await (await fetch(`${BASE}/api/settings`, J(admin.cookie))).json();
  const anyAsset = (settings.agentAssets || [])[0];
  check("settings expõe prefixo mascarado, não token em claro", anyAsset && !anyAsset.agentToken && (anyAsset.agentTokenPrefix !== undefined), JSON.stringify(anyAsset || {}).slice(0, 120));

  // Regenera token (texto puro revelado uma vez)
  const regen = await fetch(`${BASE}/api/assets/${asset.id}`, { method: "PATCH", ...J(admin.cookie), body: JSON.stringify({ regenerateAgentToken: true }) });
  const regenBody = await regen.json().catch(() => ({}));
  const token = regenBody.agentToken;
  check("regenerar token retorna texto puro uma vez", regen.status === 200 && typeof token === "string" && token.length > 10, JSON.stringify(regenBody).slice(0, 120));

  // Agente autentica com o token em claro (servidor compara por hash)
  const ctxOk = await fetch(`${BASE}/api/agent/context`, { headers: { "x-agent-token": token } });
  check("agente autentica com token regenerado (hash) → 200", ctxOk.status === 200, `status ${ctxOk.status}`);
  const ctxBad = await fetch(`${BASE}/api/agent/context`, { headers: { "x-agent-token": "token-invalido-xyz" } });
  check("token inválido → 401", ctxBad.status === 401, `status ${ctxBad.status}`);

  console.log("\n[Telemetria em série temporal]");
  const hb = await fetch(`${BASE}/api/agent/heartbeat`, {
    method: "POST", headers: { "x-agent-token": token, "content-type": "application/json" },
    body: JSON.stringify({ hostname: "NB-DEMO-001", cpuPercent: 42, memoryPercent: 55, diskPercent: 80 }),
  });
  check("heartbeat aceito (200)", hb.status === 200, `status ${hb.status}`);
  const metrics = await fetch(`${BASE}/api/assets/${asset.id}/metrics?hours=24`, J(admin.cookie));
  const metricsBody = await metrics.json().catch(() => ({}));
  const points = metricsBody.metrics || metricsBody.points || metricsBody.data || [];
  check("métricas históricas têm ao menos 1 ponto", metrics.status === 200 && points.length >= 1, `keys=${Object.keys(metricsBody)} len=${points.length}`);

  console.log("\n[Ingestão XDR/EPP]");
  const ingest = await fetch(`${BASE}/api/xdr/ingest`, {
    method: "POST", headers: { "content-type": "application/json", "x-xdr-secret": XDR_SECRET },
    body: JSON.stringify({ organizationSlug: orgSlug, provider: "DEFENDER", alerts: [{ externalId: "alert-e2e-1", severity: "HIGH", title: "Malware detectado (teste)", hostname: "NB-DEMO-001" }] }),
  });
  const ingestBody = await ingest.json().catch(() => ({}));
  check("ingestão XDR com segredo válido → 200", ingest.status === 200, `status ${ingest.status} ${JSON.stringify(ingestBody).slice(0,100)}`);
  const ingestBad = await fetch(`${BASE}/api/xdr/ingest`, {
    method: "POST", headers: { "content-type": "application/json", "x-xdr-secret": "errado" },
    body: JSON.stringify({ organizationSlug: orgSlug, provider: "DEFENDER", alerts: [{ externalId: "x", severity: "LOW", title: "x" }] }),
  });
  check("segredo XDR inválido → 401/403", [401, 403].includes(ingestBad.status), `status ${ingestBad.status}`);
  const dash2 = await (await fetch(`${BASE}/api/dashboard`, J(admin.cookie))).json();
  check("dashboard mostra alerta XDR ingerido", (dash2.xdrAlerts?.count || 0) >= 1, JSON.stringify(dash2.xdrAlerts || {}).slice(0, 120));

  console.log(`\n== Roadmap: ${pass} passou, ${fail} falhou ==\n`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
