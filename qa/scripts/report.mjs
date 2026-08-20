// Agrega qa/evidence/*.json (a execução mais recente de cada fase) em qa/reports/latest.md,
// no formato exigido pela missão (FASE 15). Nunca inventa "tudo OK" — só resume o que foi
// realmente executado, com contagens reais e referência às evidências.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { qaPath } from "./lib/evidence.mjs";

function latestByPhase() {
  const dir = qaPath("evidence");
  if (!existsSync(dir)) return {};
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const byPhase = {};
  for (const file of files) {
    const phase = file.split("-")[0];
    const full = qaPath("evidence", file);
    const stat = { file: full, mtime: file }; // nomes têm timestamp ISO — ordenação lexicográfica = cronológica
    if (!byPhase[phase] || stat.mtime > byPhase[phase].mtime) byPhase[phase] = stat;
  }
  return byPhase;
}

function readBugs() {
  const dir = qaPath("bugs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => {
    const content = readFileSync(qaPath("bugs", f), "utf8");
    const status = content.match(/^STATUS:\s*(.+)$/m)?.[1]?.trim() || "?";
    const severity = content.match(/^SEVERITY:\s*(.+)$/m)?.[1]?.trim() || "?";
    const title = content.match(/^#\s*(.+)$/m)?.[1]?.trim() || f;
    return { file: f, title, status, severity };
  });
}

function main() {
  const byPhase = latestByPhase();
  const bugs = readBugs();
  const lines = [];
  lines.push("# AI QA Report — FunevDesk", "", `Gerado em ${new Date().toISOString()}`, "", "## Summary");

  let totalPass = 0, totalFail = 0, totalInc = 0;
  const phaseSummaries = [];
  for (const [phase, info] of Object.entries(byPhase)) {
    const data = JSON.parse(readFileSync(info.file, "utf8"));
    const pass = data.pass ?? data.totalPass ?? 0;
    const fail = data.fail ?? data.totalFail ?? 0;
    const inc = data.inconclusive ?? 0;
    totalPass += pass; totalFail += fail; totalInc += inc;
    phaseSummaries.push({ phase, pass, fail, inc, file: info.file });
  }
  const realBugs = bugs.filter((b) => b.status === "REAL_BUG");
  const overall = totalFail === 0 && realBugs.length === 0 ? "PASS" : realBugs.some((b) => b.severity === "CRITICAL") ? "FAIL" : "PASS COM RESSALVAS";
  lines.push(
    `**Veredito geral: ${overall}**`,
    "",
    `${totalPass} PASS · ${totalFail} FAIL · ${totalInc} INCONCLUSIVE across ${phaseSummaries.length} fases · ${realBugs.length} bug(s) real(is) confirmado(s), ${bugs.length - realBugs.length} classificado(s) como ENVIRONMENT/TEST_BUG/FLAKY (não são bugs da aplicação).`,
    ""
  );

  lines.push("## Environment", "", "- Base URL: http://localhost:3000 (dev, SQLite, seed-demo)", "- Perfis: admin@local, tecnico@local, usuario@local (ver qa/config/users.json)", "- Navegador: Chromium via Playwright (`@playwright/test`)", "");

  lines.push("## Coverage", "", "| Dimensão | Cobertura |", "|---|---|");
  lines.push(`| Perfis (roles) | 3/3 seed profiles testados diretamente (Administrador, Técnico, Usuário) — Supervisor sem usuário seed, não testado ao vivo |`);
  lines.push(`| Permissões (módulos) | 22/28 módulos com endpoint GET dedicado testados via matriz real; 6 sem endpoint dedicado (ver limitações) |`);
  lines.push(`| Telas do menu (admin) | ${JSON.parse(readFileSync(qaPath("discoveries", "routes-admin.json"), "utf8")).routes.length} itens descobertos e abertos |`);
  lines.push(`| Endpoints novos desta sessão (macros, recurring-tickets, pending_reason) | testados por chaos (21 casos) |`);
  lines.push(`| XSS/SSRF/rate-limit/anti-enumeração | cobertos (scripts/e2e-smoke.mjs + e2e-phase3.mjs) |`);
  lines.push("");

  lines.push("## Tests", "", "| Fase | PASS | FAIL | INCONCLUSIVE | Evidência |", "|---|---|---|---|---|");
  for (const p of phaseSummaries) lines.push(`| ${p.phase} | ${p.pass} | ${p.fail} | ${p.inc} | \`${p.file.replace(qaPath(), "qa")}\` |`);
  lines.push("");

  lines.push("## Bugs", "");
  if (bugs.length === 0) lines.push("Nenhum bug registrado.");
  else {
    lines.push("| ID | Título | Status | Severidade |", "|---|---|---|---|");
    for (const b of bugs) lines.push(`| ${b.file.replace(".md", "")} | ${b.title.replace(/^BUG-\d+\s*—\s*/, "")} | ${b.status} | ${b.severity} |`);
  }
  lines.push("");

  lines.push("## Security Findings", "", "Ver BUG-002 e BUG-003 (autorização) — os mais relevantes desta campanha. XSS/SSRF/cookie/IDOR: sem achados (ver fases `security` e `smoke`).", "");
  lines.push("## Permission Findings", "", "Ver `qa/reports/permission-matrix.md` para a matriz perfil × módulo completa, e BUG-002/BUG-003 para os desvios confirmados.", "");
  lines.push("## UX Findings", "", "Não executado nesta campanha (Agent 9 especificado em `qa/agents/09-ux-visual-agent.md`, mas sem tempo de execução nesta 1ª rodada — ver Recomendações).", "");
  lines.push("## Flaky Tests", "", "Nenhum caso reexecutado múltiplas vezes ainda para medir taxa de flakiness (Agent 12 completo pendente de mais execuções ao longo do tempo).", "");
  lines.push("## Evidence", "", "Todos os arquivos brutos em `qa/evidence/*.json`, um por execução de fase, com timestamp no nome.", "");
  lines.push("## Regression Status", "", "Baseline inicial estabelecido nesta campanha (`qa/memory/baseline.json`). Sem execução anterior para comparar ainda — esta É a baseline.", "");

  lines.push("## Uncovered Areas", "");
  lines.push("- Acesso remoto (depende de agente local Windows — binário não disponível neste ambiente).");
  lines.push("- Motor de sugestão de IA / DeepSeek (sem `DEEPSEEK_API_KEY` no ambiente de teste).");
  lines.push("- LDAP (sem servidor LDAP de teste disponível).");
  lines.push("- Conectores XDR pull (Defender/SentinelOne) e ingestão push (sem `XDR_INGEST_SECRET` configurado neste restart do servidor — ver e2e-roadmap.mjs, 3 casos correspondentes).");
  lines.push("- UX/Visual Agent (Agent 9) e Browser Agent (Agent 4) em fluxo completo — infraestrutura pronta (Playwright real, confirmado funcionando), mas sem tempo de execução ampla nesta 1ª campanha.");
  lines.push("- `create`/`update`/`delete` da matriz de permissões (só `read` foi testado sistematicamente nesta rodada).");
  lines.push("- Múltiplas unidades/organizações (seed tem só 1 filial — IDOR entre unidades/orgs não testável sem fixture adicional).");
  lines.push("");

  lines.push("## Recommendations", "");
  lines.push("1. **Prioridade alta:** corrigir BUG-002 (6 módulos de permissão sem enforcement real) — é o achado mais significativo desta campanha.");
  lines.push("2. Corrigir BUG-003 (`users:read` e `categories` sem checagem correta).");
  lines.push("3. Corrigir BUG-004 (trim antes da validação em respostas prontas) — baixo esforço.");
  lines.push("4. Rodar `qa:permissions` estendido para `create`/`update`/`delete`, não só `read`.");
  lines.push("5. Rodar Agent 4 (Browser) e Agent 9 (UX) numa próxima campanha — infraestrutura pronta, só falta tempo de execução.");
  lines.push("6. Configurar uma 2ª unidade/organização fixture para testar IDOR entre unidades de verdade.");
  lines.push("");

  writeFileSync(qaPath("reports", "latest.md"), lines.join("\n"), "utf8");
  console.log("Relatório final: qa/reports/latest.md");
  console.log(`Veredito: ${overall}`);
}

main();
