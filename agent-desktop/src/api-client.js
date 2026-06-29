const { loadConfig, saveConfig, isEnrollmentToken } = require("./config");

let heartbeatRetryFn = null;

function registerHeartbeatRetry(fn) {
  heartbeatRetryFn = fn;
}

const REQUEST_TIMEOUT_MS = 25000;

function getHeaders(token) {
  return {
    "content-type": "application/json",
    "x-agent-token": token,
  };
}

async function request(method, apiPath, body, allowRetry = true) {
  const config = loadConfig();
  if (!config.serverUrl || !config.agentToken) {
    throw new Error("Agente não configurado (serverUrl/agentToken). Reinstale baixando o instalador em Configurações > Agente Windows.");
  }

  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${config.serverUrl.replace(/\/$/, "")}${apiPath}`, {
      method,
      headers: getHeaders(config.agentToken),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Timeout ao conectar a ${config.serverUrl}. Verifique se o portal está online.`);
    }
    throw new Error(`Não foi possível conectar a ${config.serverUrl}. Verifique se o FunevDesk está online. (${error.message})`);
  } finally {
    clearTimeout(timer);
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("json") ? await response.json().catch(() => ({})) : null;

  if (response.status === 401 && allowRetry && isEnrollmentToken(config.agentToken) && heartbeatRetryFn) {
    await heartbeatRetryFn(false);
    return request(method, apiPath, body, false);
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Erro HTTP ${response.status}`);
  }

  if (payload?.agentToken && payload.agentToken !== config.agentToken) {
    const latest = loadConfig();
    latest.agentToken = payload.agentToken;
    saveConfig(latest);
  }

  return payload;
}

module.exports = {
  get: (apiPath) => request("GET", apiPath),
  post: (apiPath, body) => request("POST", apiPath, body),
  registerHeartbeatRetry,
};
