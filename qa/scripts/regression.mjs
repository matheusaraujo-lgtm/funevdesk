// AGENT 12 — Regression Agent (qa/agents/12-regression-agent.md)
// Reexecuta a baseline (smoke + verificações de bug específicas) e compara contra
// qa/memory/baseline.json. Qualquer coisa que era PASS e virou FAIL é regressão nova,
// com prioridade igual a um bug novo — nunca é descartada silenciosamente.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { qaPath, saveEvidence } from "./lib/evidence.mjs";

const run = promisify(execFile);
const BASELINE_FILE = qaPath("memory", "baseline.json");

const CHECKS = [
  { name: "smoke", cmd: "node", args: ["qa/scripts/smoke.mjs"] },
  { name: "audit-permission-gap", cmd: "node", args: ["qa/scripts/regression-audit-permission-gap.mjs"] },
];

async function main() {
  const previous = existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, "utf8")) : null;
  const current = {};
  const regressions = [];

  for (const check of CHECKS) {
    console.log(`\n== regressão: ${check.name} ==`);
    let status;
    try {
      const { stdout } = await run(check.cmd, check.args, { cwd: process.cwd(), timeout: 120000 });
      console.log(stdout);
      status = "PASS";
    } catch (err) {
      console.log(err.stdout || err.message);
      status = "FAIL";
    }
    current[check.name] = status;
    if (previous && previous[check.name] === "PASS" && status === "FAIL") {
      regressions.push(check.name);
      console.log(`  🔴 REGRESSÃO: ${check.name} era PASS na baseline anterior e agora é FAIL.`);
    }
  }

  writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2), "utf8");
  const evidenceFile = saveEvidence("regression", { previous, current, regressions });
  console.log(`\n== Regressão: ${regressions.length} nova(s) regressão(ões) ==`);
  console.log(`Baseline atualizado: ${BASELINE_FILE}`);
  console.log(`Evidência: ${evidenceFile}`);
  process.exit(regressions.length > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
