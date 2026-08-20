// Helper HTTP compartilhado por todos os scripts de QA — mesmo padrão já usado em
// scripts/e2e-smoke.mjs (cookie nexus_session extraído do Set-Cookie), para não reinventar
// autenticação em cada agente.
import { resolveBaseUrl } from "../../config/environment.mjs";
import users from "../../config/users.json" with { type: "json" };

export const BASE = resolveBaseUrl();

function cookieFrom(res) {
  const raw = res.headers.get("set-cookie") || "";
  const match = raw.match(/nexus_session=[^;]+/);
  return match ? match[0] : "";
}

export async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, cookie: cookieFrom(res), body };
}

// O rate-limit de login (src/lib/security.js) é por IP (20/5min) e por e-mail (8/5min).
// Uma campanha de QA completa faz muitos logins em pouco tempo (cada script reautentica
// os 3 perfis) — achado real desta sessão (ver qa/bugs/BUG-005.md): sem backoff, a própria
// campanha se auto-bloqueia. Retry com espera curta em vez de falhar imediatamente.
export async function loginAs(profileKey, { retries = 3, backoffMs = 20_000 } = {}) {
  const user = users[profileKey];
  if (!user) throw new Error(`Perfil desconhecido em qa/config/users.json: ${profileKey}`);
  for (let attempt = 0; attempt <= retries; attempt++) {
    const session = await login(user.email, user.password);
    if (session.cookie) return session;
    if (session.status === 429 && attempt < retries) {
      console.log(`  (login ${profileKey} rate-limited, aguardando ${backoffMs / 1000}s antes de tentar de novo — tentativa ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }
    throw new Error(`Login falhou para ${profileKey} (${user.email}): status ${session.status}`);
  }
}

export function authHeaders(cookie, extra = {}) {
  return { headers: { cookie, "content-type": "application/json", ...extra } };
}

export async function api(method, path, { cookie = "", body, extraHeaders = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extraHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* corpo não é JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

// Coletor de resultados simples e uniforme — todo script de QA usa o mesmo formato,
// para o Agent report.mjs conseguir agregar sem parsers customizados por fase.
export function createCollector(phase) {
  const results = [];
  function check(name, status, extra = {}) {
    const entry = { name, status, phase, timestamp: new Date().toISOString(), ...extra };
    results.push(entry);
    const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️ ";
    const suffix = extra.detail ? ` — ${extra.detail}` : "";
    console.log(`  ${icon} ${name}${suffix}`);
    return entry;
  }
  function pass(name, extra = {}) { return check(name, "PASS", extra); }
  function fail(name, extra = {}) { return check(name, "FAIL", extra); }
  function inconclusive(name, reason, extra = {}) { return check(name, "INCONCLUSIVE", { detail: reason, ...extra }); }
  function summary() {
    const pass_ = results.filter((r) => r.status === "PASS").length;
    const fail_ = results.filter((r) => r.status === "FAIL").length;
    const inc_ = results.filter((r) => r.status === "INCONCLUSIVE").length;
    return { phase, total: results.length, pass: pass_, fail: fail_, inconclusive: inc_, results };
  }
  return { check, pass, fail, inconclusive, summary, results };
}
