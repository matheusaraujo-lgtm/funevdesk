// Fase smoke: reaproveita os scripts e2e-*.mjs já existentes no projeto (não recriados —
// já cobrem login/RBAC/XSS/SSRF/rate-limit/perfis bem). Roda todos, agrega pass/fail.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync } from "node:fs";
import { saveEvidence, qaPath } from "./lib/evidence.mjs";

const run = promisify(execFile);

const SUITES = [
  { name: "e2e-smoke", script: "scripts/e2e-smoke.mjs" },
  { name: "e2e-phase3", script: "scripts/e2e-phase3.mjs" },
  { name: "e2e-roadmap", script: "scripts/e2e-roadmap.mjs" },
  { name: "test-profiles", script: "scripts/test-profiles.mjs", env: { BASE: process.env.BASE || "http://localhost:3000" } },
];

function parseCounts(output) {
  const passCount = (output.match(/✅|✓/g) || []).length;
  const failCount = (output.match(/❌|✗/g) || []).length;
  return { pass: passCount, fail: failCount };
}

async function main() {
  const results = [];
  for (const suite of SUITES) {
    console.log(`\n== ${suite.name} ==`);
    try {
      const { stdout } = await run("node", [suite.script], { cwd: process.cwd(), env: { ...process.env, ...(suite.env || {}) }, timeout: 60000 });
      console.log(stdout);
      const counts = parseCounts(stdout);
      results.push({ suite: suite.name, status: counts.fail === 0 ? "PASS" : "FAIL", ...counts });
    } catch (err) {
      const stdout = err.stdout || "";
      console.log(stdout);
      console.log(`  (processo saiu com código != 0: ${err.code ?? err.message})`);
      const counts = parseCounts(stdout);
      results.push({ suite: suite.name, status: "FAIL", ...counts, error: String(err.message).slice(0, 300) });
    }
  }

  const totalFail = results.reduce((sum, r) => sum + r.fail, 0);
  const totalPass = results.reduce((sum, r) => sum + r.pass, 0);
  const evidenceFile = saveEvidence("smoke", { results, totalPass, totalFail });

  const lines = ["# Smoke — resultado consolidado", "", `Gerado em ${new Date().toISOString()}`, "", "| Suíte | Status | PASS | FAIL |", "|---|---|---|---|"];
  for (const r of results) lines.push(`| ${r.suite} | ${r.status} | ${r.pass} | ${r.fail} |`);
  writeFileSync(qaPath("reports", "smoke-summary.md"), lines.join("\n"), "utf8");

  console.log(`\n== Smoke total: ${totalPass} PASS, ${totalFail} FAIL ==`);
  console.log(`Evidência: ${evidenceFile}`);
  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
