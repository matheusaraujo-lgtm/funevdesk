// Serviço de execução privilegiada do agente FunevDesk.
//
// Roda como LocalSystem (via Tarefa Agendada do Windows, lançado com ELECTRON_RUN_AS_NODE=1,
// portanto sem Chromium/GUI — funciona na Sessão 0). Lê comandos da fila
// ProgramData\FunevDesk\commands\pending, executa com privilégios totais (instalar software
// via winget, isolar a rede, varredura de antivírus) e grava o resultado em results\.
//
// O Electron (sessão do usuário) continua sendo a ponte com o servidor: ele recebe os comandos
// no heartbeat, escreve na fila e devolve os resultados. Este serviço NÃO fala com o servidor
// nem precisa do token — só executa localmente o que exige elevação. É assim que os RMM/EPP de
// mercado operam: um serviço SYSTEM faz o trabalho privilegiado, separado da interface.

const fs = require("node:fs");
const path = require("node:path");
const { executeCommand } = require("./incident-response");

const CONFIG_DIR = path.join(process.env.ProgramData || "C:\\ProgramData", "FunevDesk");
const CMD_DIR = path.join(CONFIG_DIR, "commands");
const PENDING_DIR = path.join(CMD_DIR, "pending");
const RESULTS_DIR = path.join(CMD_DIR, "results");
const ALIVE_FILE = path.join(CMD_DIR, "service-alive.txt");
const LOG_FILE = path.join(CMD_DIR, "service.log");

const POLL_MS = 3000;

function log(message) {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch {
    /* logar nunca pode derrubar o serviço */
  }
}

function ensureDirs() {
  for (const dir of [CMD_DIR, PENDING_DIR, RESULTS_DIR]) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* já existe */ }
  }
}

function writeResult(id, result) {
  const tmp = path.join(RESULTS_DIR, `.${id}.tmp`);
  const dst = path.join(RESULTS_DIR, `${id}.json`);
  fs.writeFileSync(tmp, JSON.stringify(result), "utf8");
  fs.renameSync(tmp, dst);
}

let busy = false;

async function tick() {
  // Pulso de vida: o Electron só delega se este arquivo estiver recente.
  try { fs.writeFileSync(ALIVE_FILE, String(Date.now()), "utf8"); } catch { /* ignora */ }

  if (busy) return;
  busy = true;
  try {
    let files = [];
    try {
      files = fs.readdirSync(PENDING_DIR).filter((f) => f.endsWith(".json"));
    } catch {
      files = [];
    }
    for (const file of files) {
      const full = path.join(PENDING_DIR, file);
      let cmd;
      try {
        cmd = JSON.parse(fs.readFileSync(full, "utf8"));
      } catch {
        try { fs.unlinkSync(full); } catch { /* ignora */ }
        continue;
      }
      // Remove o pendente ANTES de executar: se o serviço cair no meio de um winget longo,
      // o comando não é reexecutado infinitamente ao reiniciar.
      try { fs.unlinkSync(full); } catch { /* ignora */ }
      if (!cmd || !cmd.id || !cmd.command) continue;

      log(`executando ${cmd.command} (${cmd.id})`);
      try {
        const res = await executeCommand(
          { id: cmd.id, command: cmd.command, params: cmd.params },
          { serverUrl: cmd.serverUrl },
        );
        writeResult(cmd.id, { id: cmd.id, status: res.status, result: res.result });
        log(`${cmd.command} → ${res.status}: ${res.result}`);
      } catch (error) {
        writeResult(cmd.id, { id: cmd.id, status: "FAILED", result: error?.message || String(error) });
        log(`${cmd.command} ERRO: ${error?.message || error}`);
      }
    }
  } finally {
    busy = false;
  }
}

ensureDirs();
log("Serviço de comandos FunevDesk iniciado (SYSTEM).");
tick();
setInterval(() => { tick().catch((e) => log(`tick erro: ${e?.message || e}`)); }, POLL_MS);

// Mantém o processo vivo mesmo sem trabalho (a Tarefa Agendada espera um processo longo).
process.on("uncaughtException", (e) => log(`uncaught: ${e?.message || e}`));
process.on("unhandledRejection", (e) => log(`unhandled: ${e?.message || e}`));
