// AGENT 1 — Orchestrator (qa/agents/01-orchestrator.md)
// Roda a campanha completa em ordem seguindo o DAG documentado. Sequencial (não paralelo)
// de propósito: a lição de BUG-005 é que rodar tudo ao mesmo tempo estoura o rate-limit de
// login — cada fase já é rápida o bastante para não precisar de paralelismo agressivo.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, readdirSync, existsSync } from "node:fs";
import { qaPath } from "./lib/evidence.mjs";

const run = promisify(execFile);

const PHASES = [
  { name: "pré-voo (seed:demo)", cmd: "npm", args: ["run", "seed:demo"] },
  { name: "discovery", cmd: "node", args: ["qa/scripts/discover.mjs"] },
  { name: "permissions", cmd: "node", args: ["qa/scripts/permissions.mjs"] },
  { name: "chaos", cmd: "node", args: ["qa/scripts/chaos.mjs"] },
  { name: "security", cmd: "node", args: ["qa/scripts/security.mjs"] },
  { name: "smoke (regressão)", cmd: "node", args: ["qa/scripts/smoke.mjs"] },
  { name: "report", cmd: "node", args: ["qa/scripts/report.mjs"] },
];

async function main() {
  const phasesRun = [];
  const phasesSkipped = [];
  for (const phase of PHASES) {
    console.log(`\n\n########## ${phase.name.toUpperCase()} ##########`);
    try {
      const { stdout } = await run(phase.cmd, phase.args, { cwd: process.cwd(), timeout: 180000 });
      console.log(stdout);
      phasesRun.push(phase.name);
    } catch (err) {
      console.log(err.stdout || "");
      console.log(`(fase terminou com falhas — código ${err.code ?? err.message}; seguindo para a próxima fase mesmo assim, exceto pré-voo)`);
      phasesRun.push(phase.name);
      if (phase.name.startsWith("pré-voo") ) {
        console.log("Pré-voo falhou — abortando campanha (sem seed, o resto não tem base confiável).");
        phasesSkipped.push({ phase: "todas as demais", reason: "seed:demo falhou" });
        break;
      }
    }
  }

  const bugsDir = qaPath("bugs");
  const bugCount = existsSync(bugsDir) ? readdirSync(bugsDir).filter((f) => f.endsWith(".md")).length : 0;
  const state = {
    lastRun: new Date().toISOString(),
    phasesRun,
    phasesSkipped,
    bugsTotal: bugCount,
  };
  writeFileSync(qaPath("memory", "state.json"), JSON.stringify(state, null, 2), "utf8");
  console.log("\n\nEstado salvo em qa/memory/state.json");
  console.log("Relatório final em qa/reports/latest.md");
}

main().catch((err) => { console.error(err); process.exit(2); });
