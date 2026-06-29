const { loadConfig, saveConfig, isPermanentToken, isEnrollmentToken, isValidConfig, appendLog, bundledConfigPath } = require("./config");
const fs = require("node:fs");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resetToBundledEnrollmentIfNeeded() {
  const config = loadConfig();
  const bundled = readJson(bundledConfigPath());
  if (!bundled?.agentToken || !isEnrollmentToken(bundled.agentToken)) return config;
  if (config.agentToken === bundled.agentToken) return config;

  appendLog("Token local inválido — restaurando chave de enrollment do instalador.");
  const merged = { ...config, ...bundled, agentToken: bundled.agentToken };
  saveConfig(merged);
  return merged;
}

let ensurePromise = null;
let sendHeartbeatFn = null;

function registerHeartbeatSender(fn) {
  sendHeartbeatFn = fn;
}

async function probeAuthorized(token, serverUrl) {
  try {
    const response = await fetch(`${serverUrl.replace(/\/$/, "")}/api/agent/tickets`, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "x-agent-token": token,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureAgentReady() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const config = loadConfig();
    if (!isValidConfig(config)) {
      throw new Error("Agente não configurado. Clique com o botão direito no ícone do agente → Configurar agente.");
    }

    if (isPermanentToken(config.agentToken)) {
      const authorized = await probeAuthorized(config.agentToken, config.serverUrl);
      if (authorized) return config;
      appendLog("Token permanente rejeitado — tentando re-registrar via heartbeat.");
      resetToBundledEnrollmentIfNeeded();
    }

    if (!sendHeartbeatFn) {
      throw new Error("Serviço de conexão ainda não iniciou. Aguarde alguns segundos.");
    }

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      appendLog(`ensureAgentReady: tentativa ${attempt}/5`);
      await sendHeartbeatFn(false);

      const latest = loadConfig();
      if (isPermanentToken(latest.agentToken)) {
        const authorized = await probeAuthorized(latest.agentToken, latest.serverUrl);
        if (authorized) return latest;
      }

      if (isEnrollmentToken(latest.agentToken)) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const finalConfig = loadConfig();
    throw new Error(
      finalConfig.serverUrl
        ? `Não foi possível registrar no servidor ${finalConfig.serverUrl}. Verifique se o FunevDesk está online e se a chave de enrollment é válida.`
        : "Agente não configurado.",
    );
  })().finally(() => {
    ensurePromise = null;
  });

  return ensurePromise;
}

module.exports = {
  ensureAgentReady,
  registerHeartbeatSender,
  probeAuthorized,
  resetToBundledEnrollmentIfNeeded,
};
