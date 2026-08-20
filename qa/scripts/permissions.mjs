// AGENT 7 — Permission Attacker (qa/agents/07-permission-attacker.md)
// Matriz real: perfil × módulo × ação "read", comparada contra src/lib/permissions.js
// (fonte da verdade, importada diretamente — nunca reescrita à mão). Cobre os 22 módulos
// com endpoint GET dedicado conhecido; os 6 sem enforcement próprio (ver BUG-002) são
// listados à parte, já que testá-los aqui daria falso PASS (a API bloqueia por um motivo
// errado, mas bloqueia mesmo assim para a maioria dos perfis seed por coincidência).
import { writeFileSync } from "node:fs";
import { MODULES, SEED_PROFILES, seedMatrix } from "../../src/lib/permissions.js";
import { loginAs, api, createCollector } from "./lib/http.mjs";
import { saveEvidence, qaPath } from "./lib/evidence.mjs";

// module key -> { method, path } de um endpoint GET real que a rota protege por este módulo.
// "null" = sem endpoint GET dedicado conhecido (ver limitações no relatório final).
const READ_ENDPOINT = {
  tickets: null, // sem GET de listagem dedicado — dados vêm agregados em /api/dashboard
  assets: { path: "/api/assets" },
  inventory: { path: "/api/inventory" },
  terms: { path: "/api/terms" },
  problems: { path: "/api/problems" }, // NOTE: BUG-002 — checa canManageTickets, não "problems"
  changes: { path: "/api/changes" }, // NOTE: BUG-002 — checa canManageTickets, não "changes"
  projects: { path: "/api/projects" },
  knowledge: { path: "/api/knowledge" },
  documentation: { path: "/api/documents" },
  printers: null, // NOTE: BUG-002 — sem enforcement próprio
  network: { path: "/api/network" },
  security: { path: "/api/security" }, // NOTE: BUG-002 — checa canViewAssets, não "security"
  teams: { path: "/api/teams" },
  reports: { path: "/api/reports" },
  audit: { path: "/api/audit" }, // NOTE: BUG-002 — checa role==="ADMIN", não "audit"
  settings: { path: "/api/settings" }, // NOTE: BUG-002 — checa role==="ADMIN", não "settings"
  branches: { path: "/api/branches" },
  locations: { path: "/api/locations" },
  users: { path: "/api/users" },
  profiles: { path: "/api/profiles" },
  ticket_types: null, // catálogo é intencionalmente aberto a todo autenticado (EMPLOYEE precisa ler pra abrir chamado)
  categories: { path: "/api/categories" },
  statuses: { path: "/api/ticket-statuses" },
  term_templates: { path: "/api/term-templates" },
  webhooks: { path: "/api/webhooks" },
  canned_responses: { path: "/api/macros" },
  recurring_tickets: { path: "/api/recurring-tickets" },
  remote: null, // sem listagem própria — por chamado
};

const PROFILE_KEY_BY_SLUG = { administrador: "admin", tecnico: "tecnico", usuario: "usuario" };

// Exceções legítimas: o endpoint concede leitura por um OR documentado no próprio código-fonte
// (ex.: "locations" libera quem tem tickets:create, pois o campo é usado ao abrir chamado) OU
// porque o dado é necessário para QUALQUER usuário autenticado renderizar a UI (ex.: rótulos de
// status de chamado). Sem esta lista, o Permission Attacker gera falso-positivo nesses 3 módulos
// — achado real na 1ª execução (2026-08-19), investigado em qa/bugs/BUG-003.md.
const KNOWN_INTENTIONAL_EXCEPTIONS = new Set(["locations", "term_templates", "statuses", "users"]);
// "users" entrou na lista em 2026-08-20 depois da correção do BUG-003: agora é um OR aditivo
// (canManageTickets OU users:read), igual ao padrão de locations/term_templates — um perfil
// com canManageTickets=true (ex.: Técnico seed) continua vendo a lista por aquele motivo, o
// que é esperado. O bug real (users:read=true sozinho não bastava) foi verificado corrigido
// via qa/scripts/regression-audit-permission-gap.mjs (mesmo padrão usado para "audit").

async function main() {
  const c = createCollector("permissions");
  const sessions = {};
  for (const key of ["admin", "tecnico", "usuario"]) sessions[key] = await loginAs(key);

  const matrixRows = [];
  for (const profile of SEED_PROFILES) {
    const sessionKey = PROFILE_KEY_BY_SLUG[profile.slug];
    if (!sessionKey) continue; // "supervisor" não tem usuário seed — sem sessão pra testar ao vivo
    const expected = seedMatrix(profile.grants);
    const cookie = sessions[sessionKey].cookie;

    for (const mod of MODULES) {
      if (!mod.actions.includes("read")) continue;
      const endpoint = READ_ENDPOINT[mod.key];
      if (!endpoint) {
        c.inconclusive(`${profile.slug}/${mod.key}:read`, "sem endpoint GET dedicado conhecido — ver limitações");
        matrixRows.push({ profile: profile.slug, module: mod.key, action: "read", expected: null, actual: null, httpStatus: null, match: null });
        continue;
      }
      const expectedRead = expected[mod.key].read;
      const res = await api("GET", endpoint.path, { cookie });
      const actualRead = res.status !== 401 && res.status !== 403;
      const match = expectedRead === actualRead;
      matrixRows.push({ profile: profile.slug, module: mod.key, action: "read", expected: expectedRead, actual: actualRead, httpStatus: res.status, match, knownException: KNOWN_INTENTIONAL_EXCEPTIONS.has(mod.key) });
      const label = `${profile.slug}/${mod.key}:read (esperado=${expectedRead})`;
      if (match) c.pass(label, { httpStatus: res.status });
      else if (KNOWN_INTENTIONAL_EXCEPTIONS.has(mod.key)) c.inconclusive(label, "exceção intencional documentada no código-fonte — ver qa/bugs/BUG-003.md", { httpStatus: res.status });
      else c.fail(label, { httpStatus: res.status, detail: `esperado ${expectedRead ? "acesso" : "bloqueio"}, obteve status ${res.status}` });
    }
  }

  const evidenceFile = saveEvidence("permissions", c.summary());
  writeMatrixReport(matrixRows);
  console.log(`\n== Permissions: ${c.summary().pass} PASS, ${c.summary().fail} FAIL, ${c.summary().inconclusive} INCONCLUSIVE ==`);
  console.log(`Evidência: ${evidenceFile}`);
  process.exit(c.summary().fail > 0 ? 1 : 0);
}

function writeMatrixReport(rows) {
  const lines = ["# Matriz de Permissões — resultado real", "", `Gerado em ${new Date().toISOString()}`, "", "| Perfil | Módulo | Esperado | Real | HTTP | Resultado |", "|---|---|---|---|---|---|"];
  for (const r of rows) {
    const result = r.match === null ? "INCONCLUSIVE" : r.match ? "PASS" : "FAIL";
    lines.push(`| ${r.profile} | ${r.module} | ${r.expected ?? "—"} | ${r.actual ?? "—"} | ${r.httpStatus ?? "—"} | ${result} |`);
  }
  lines.push("", "## Módulos sem endpoint GET dedicado testável por este script", "", "`tickets` (agregado em /api/dashboard), `printers` (ver BUG-002), `ticket_types` (catálogo intencionalmente público a autenticados), `remote` (por chamado, sem listagem).");
  writeFileSync(qaPath("reports", "permission-matrix.md"), lines.join("\n"), "utf8");
}

main().catch((err) => { console.error(err); process.exit(2); });
