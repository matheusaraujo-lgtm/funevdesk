// Resposta a incidente despachada pelo servidor (Central de Segurança) ao agente.
// Executa ações de EDR no endpoint: isolar host da rede, reconectar e varredura
// de antivírus. Os comandos chegam na resposta do heartbeat; os resultados são
// reportados no heartbeat seguinte (fila `pendingResults`).

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { appendLog } = require("./config");

const RULE_PREFIX = "FunevDesk-Isolamento";

// Fila de comandos compartilhada com o serviço SYSTEM (execução privilegiada).
// O Electron (sessão do usuário) escreve em pending/ e lê de results/; o serviço
// (LocalSystem) faz o inverso. Permite instalar software e isolar a rede com
// privilégios totais, sem depender de o usuário logado ser administrador.
const CMD_DIR = path.join(process.env.ProgramData || "C:\\ProgramData", "FunevDesk", "commands");
const PENDING_DIR = path.join(CMD_DIR, "pending");
const RESULTS_DIR = path.join(CMD_DIR, "results");
const ALIVE_FILE = path.join(CMD_DIR, "service-alive.txt");

// O serviço escreve seu "pulso" a cada poucos segundos. Se o pulso for recente,
// delegamos os comandos a ele; senão, executamos localmente (compatível com
// instalações sem o serviço).
function isServiceAlive() {
  try {
    return Date.now() - fs.statSync(ALIVE_FILE).mtimeMs < 30000;
  } catch {
    return false;
  }
}

// Escrita atômica (tmp + rename) para o leitor nunca pegar um JSON pela metade.
function atomicWrite(dir, id, payload) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${id}.tmp`);
  const dst = path.join(dir, `${id}.json`);
  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, dst);
}

function runPowerShell(script, timeoutMs = 120000) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) resolve({ ok: false, output: String(stderr || err.message || "").trim() });
        else resolve({ ok: true, output: String(stdout || "").trim() });
      },
    );
  });
}

async function executeCommand(cmd, config) {
  const command = String(cmd.command || "").toUpperCase();
  try {
    if (command === "ISOLATE") {
      // Bloqueia toda comunicação de entrada/saída, exceto o servidor FunevDesk
      // (para o host permanecer gerenciável e poder ser reconectado remotamente).
      let allow = "";
      try {
        const host = new URL(config.serverUrl).hostname;
        if (host) {
          allow = `$ips=(Resolve-DnsName '${host}' -ErrorAction SilentlyContinue | Where-Object {$_.IPAddress} | Select-Object -ExpandProperty IPAddress); if($ips){ New-NetFirewallRule -DisplayName '${RULE_PREFIX}-Allow' -Direction Outbound -Action Allow -RemoteAddress $ips -ErrorAction SilentlyContinue | Out-Null };`;
        }
      } catch { /* serverUrl inválido — isola tudo mesmo assim */ }
      const script = `${allow} New-NetFirewallRule -DisplayName '${RULE_PREFIX}-OutBlock' -Direction Outbound -Action Block -ErrorAction SilentlyContinue | Out-Null; New-NetFirewallRule -DisplayName '${RULE_PREFIX}-InBlock' -Direction Inbound -Action Block -ErrorAction SilentlyContinue | Out-Null; 'Host isolado da rede (exceto servidor FunevDesk).'`;
      const r = await runPowerShell(script);
      return { id: cmd.id, status: r.ok ? "DONE" : "FAILED", result: r.output || "Isolamento aplicado." };
    }
    if (command === "UNISOLATE") {
      const script = `Get-NetFirewallRule -DisplayName '${RULE_PREFIX}-*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue; 'Host reconectado à rede.'`;
      const r = await runPowerShell(script);
      return { id: cmd.id, status: r.ok ? "DONE" : "FAILED", result: r.output || "Host reconectado." };
    }
    if (command === "SCAN") {
      const r = await runPowerShell("try { Start-MpScan -ScanType QuickScan -ErrorAction Stop; 'Varredura rápida concluída.' } catch { 'Falha ao iniciar varredura: ' + $_.Exception.Message }", 600000);
      return { id: cmd.id, status: r.ok ? "DONE" : "FAILED", result: r.output || "Varredura executada." };
    }
    if (command === "INSTALL_APP" || command === "UNINSTALL_APP") {
      // Distribuição remota de software via winget (App Installer). O técnico escolhe
      // o app na Central; o agente instala/desinstala em silêncio, sem ir ao endpoint.
      const p = cmd.params || {};
      const pkg = String(p.packageId || "").trim();
      const label = String(p.name || pkg);
      // Sanitização: IDs winget são alfanuméricos com . _ + - (ex.: Google.Chrome, 7zip.7zip).
      // Bloqueia injeção de PowerShell — o ID é interpolado dentro de aspas simples.
      if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{1,80}$/.test(pkg)) {
        return { id: cmd.id, status: "FAILED", result: "Identificador de pacote inválido." };
      }
      const verb = command === "UNINSTALL_APP" ? "uninstall" : "install";
      const extra = command === "UNINSTALL_APP" ? "" : "--accept-package-agreements --accept-source-agreements";
      const script = `if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { 'WINGET_AUSENTE' } else { winget ${verb} --id '${pkg}' --exact --silent ${extra} --disable-interactivity 2>&1 | Out-String; "EXIT=$LASTEXITCODE" }`;
      const r = await runPowerShell(script, 600000);
      const out = String(r.output || "");
      if (/WINGET_AUSENTE/.test(out)) {
        return { id: cmd.id, status: "FAILED", result: "winget (App Installer) não está disponível neste Windows." };
      }
      const m = out.match(/EXIT=(-?\d+)/);
      const code = m ? parseInt(m[1], 10) : (r.ok ? 0 : 1);
      const ok = code === 0;
      const tail = out.replace(/EXIT=-?\d+\s*$/, "").trim().split(/\r?\n/).filter(Boolean).slice(-3).join(" | ").slice(0, 500);
      const acao = command === "UNINSTALL_APP" ? "desinstalado" : "instalado";
      const acaoFail = command === "UNINSTALL_APP" ? "desinstalar" : "instalar";
      // Traduz os códigos de saída mais comuns do winget para uma mensagem que o técnico entende,
      // em vez de despejar um número de erro do Windows na tela.
      const motivos = {
        "-2147023673": "requer privilégios de administrador (o agente precisa rodar elevado para este app)",
        "-1978335189": "nenhuma versão aplicável encontrada para este equipamento",
        "-1978335215": "pacote não encontrado no catálogo winget",
        "-1978335212": "pacote não encontrado no catálogo winget",
        "-1978334969": "já está na versão mais recente",
        "-1978335135": "nenhuma atualização aplicável disponível",
      };
      const motivo = ok ? "" : (motivos[String(code)] ? `: ${motivos[String(code)]}` : ` (cód ${code})`);
      const resultado = ok
        ? `${label}: ${acao}${tail ? " — " + tail : ""}`
        : `${label}: falha ao ${acaoFail}${motivo}${tail ? " — " + tail : ""}`;
      return { id: cmd.id, status: ok ? "DONE" : "FAILED", result: resultado.slice(0, 800) };
    }
    return { id: cmd.id, status: "FAILED", result: `Comando desconhecido: ${command}` };
  } catch (error) {
    return { id: cmd.id, status: "FAILED", result: error?.message || String(error) };
  }
}

const pendingResults = [];

async function processCommands(commands, config) {
  if (!Array.isArray(commands) || !commands.length) return;
  const viaService = isServiceAlive();
  for (const cmd of commands.slice(0, 10)) {
    if (viaService) {
      // Delega ao serviço SYSTEM: escreve o comando na fila. O resultado volta por results/.
      try {
        atomicWrite(PENDING_DIR, cmd.id, JSON.stringify({
          id: cmd.id, command: cmd.command, params: cmd.params || null, serverUrl: config.serverUrl,
        }));
        appendLog(`[resposta] comando ${cmd.command} (${cmd.id}) delegado ao serviço (SYSTEM)`);
        continue;
      } catch (error) {
        appendLog(`[resposta] falha ao delegar (${error?.message || error}); executando localmente`);
      }
    }
    appendLog(`[resposta] executando comando ${cmd.command} (${cmd.id}) [local]`);
    const res = await executeCommand(cmd, config);
    appendLog(`[resposta] ${cmd.command} → ${res.status}: ${res.result}`);
    pendingResults.push(res);
  }
}

// Recolhe os resultados produzidos pelo serviço SYSTEM (results/*.json) e os junta
// aos executados localmente, para irem no próximo heartbeat.
function collectServiceResults() {
  let files;
  try {
    files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  for (const file of files) {
    const full = path.join(RESULTS_DIR, file);
    try {
      const res = JSON.parse(fs.readFileSync(full, "utf8"));
      if (res && res.id) pendingResults.push({ id: res.id, status: res.status, result: res.result });
    } catch {
      /* resultado corrompido — descarta */
    }
    try { fs.unlinkSync(full); } catch { /* já removido */ }
  }
}

function drainResults() {
  collectServiceResults();
  if (!pendingResults.length) return [];
  return pendingResults.splice(0, pendingResults.length);
}

module.exports = { processCommands, drainResults, executeCommand };
