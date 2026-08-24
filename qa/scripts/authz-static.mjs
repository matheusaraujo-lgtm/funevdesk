// Verificador ESTÁTICO de autorização — roda no CI antes do deploy (e local: npm run qa:authz).
//
// Motivação: a auditoria de 24/08/2026 encontrou 9 rotas que esqueceram o escopo de
// unidade (listagens vazando outras filiais, PATCH/DELETE sem checar a unidade do
// registro). Enquanto a checagem for disciplina individual, a classe de bug volta a
// cada rota nova. Este script transforma a convenção em gate de build:
//
//   Regra 1 — toda rota de API precisa de um gate de sessão/permissão:
//             authorize() (padrão para código novo — src/lib/authorize.js),
//             requirePermission() ou requireCurrentUser() (legado válido).
//   Regra 2 — toda rota que toca dado com unidade (branch_id/branchId) precisa
//             referenciar um mecanismo de escopo por unidade.
//
// Isenções são EXPLÍCITAS e justificadas abaixo. Para isentar uma rota nova,
// adicione-a à lista com o motivo — a revisão do PR decide se o motivo se sustenta.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const API_ROOT = path.join(process.cwd(), "src", "app", "api");

// Prefixos autenticados por OUTRO mecanismo (não sessão de usuário):
// - api/agent/*: autenticação por token de agente (x-agent-token / chave de enrollment);
//   a unidade deriva do próprio ativo dono do token.
// - api/auth/*: são os endpoints de autenticação em si (login/logout/me/troca de senha).
const GATE_EXEMPT_PREFIXES = ["agent/", "auth/"];

// Arquivos individuais sem gate de sessão, por design:
const GATE_EXEMPT_FILES = new Set([
  "health/route.js", // público de propósito: monitoramento externo, não expõe dados
  "xdr/ingest/route.js", // autenticado por segredo compartilhado (XDR_INGEST_SECRET)
  "branding/logo/[...slug]/route.js", // logo da organização na tela de login (público)
]);

// Arquivos que tocam branch_id mas cujo escopo é garantido por outro modelo:
const SCOPE_EXEMPT_FILES = new Set([
  // Autorização por posse da sessão remota (solicitante ou ADMIN) + organização —
  // o branch_id ali é só coluna do INSERT de auditoria.
  "remote/sessions/[sessionId]/signal/route.js",
  // Configurações são org-level e restritas a canConfigure; a lista de ativos com
  // agente é deliberadamente org-wide para a tela de instalação.
  "settings/route.js",
]);

const GATE_MARKERS = /authorize\(|requirePermission\(|requireCurrentUser\(/;
const BRANCH_DATA = /branch_id|branchId/;
const SCOPE_MARKERS = /branchGate\(|canAccessBranch\(|assertBranchAccess\(|getAllowedBranchIds\(|canAccessTicket\(|canViewAllBranches|all_branches|branchFilterClause\(|filterByBranchScope\(|getScopedXdrAlert\(/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "route.js") out.push(full);
  }
  return out;
}

const failures = [];
const routes = walk(API_ROOT);
for (const file of routes) {
  const rel = path.relative(API_ROOT, file).replaceAll("\\", "/");
  const content = readFileSync(file, "utf8");

  const gateExempt = GATE_EXEMPT_FILES.has(rel) || GATE_EXEMPT_PREFIXES.some((p) => rel.startsWith(p));
  if (!gateExempt && !GATE_MARKERS.test(content)) {
    failures.push(`${rel}\n    → sem gate de autorização. Abra o handler com authorize() (src/lib/authorize.js) ou isente aqui com justificativa.`);
  }

  const scopeExempt = gateExempt || SCOPE_EXEMPT_FILES.has(rel);
  if (!scopeExempt && BRANCH_DATA.test(content) && !SCOPE_MARKERS.test(content)) {
    failures.push(`${rel}\n    → toca dados com unidade (branch_id) sem nenhum mecanismo de escopo. Use auth.branchGate(row.branch_id) após carregar o registro, ou getAllowedBranchIds() na listagem.`);
  }
}

if (failures.length) {
  console.error(`\n✖ authz-static: ${failures.length} rota(s) sem autorização/escopo adequado:\n`);
  for (const failure of failures) console.error(`  ${failure}\n`);
  console.error("Referência: src/lib/authorize.js (padrão) e qa/scripts/authz-static.mjs (isenções).\n");
  process.exit(1);
}
console.log(`✓ authz-static: ${routes.length} rotas verificadas — gates de autorização e escopo por unidade OK.`);
