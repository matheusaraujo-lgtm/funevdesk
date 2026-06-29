const fs = require("node:fs");
const path = require("node:path");
// Em ELECTRON_RUN_AS_NODE (o serviço de comandos SYSTEM roda o exe como Node puro, sem o
// runtime Electron) o módulo "electron" não existe e o require lança. O agente principal usa
// `app`; o serviço não. Toleramos a ausência para os módulos compartilhados (config, log)
// carregarem nos dois contextos.
let app = null;
try { ({ app } = require("electron")); } catch { /* processo Node puro (serviço) */ }
// Fonte única da versão do agente: o package.json empacotado (mesma que o electron-builder
// e o electron-updater usam). Evita o "1.2.0" duplicado em vários arquivos.
const pkg = require("../package.json");

const CONFIG_DIR = path.join(process.env.ProgramData || "C:\\ProgramData", "FunevDesk");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const LOG_PATH = path.join(CONFIG_DIR, "agent.log");

const INVALID_TOKENS = new Set([
  "",
  "COLE_O_TOKEN_AQUI",
  "nxen_test_build",
  "TOKEN_DO_ATIVO",
]);

const DEFAULTS = {
  serverUrl: "",
  agentToken: "",
  agentVersion: pkg.version,
  appName: "FunevDesk",
  logoUrl: "",
  primaryColor: "#102033",
  heartbeatSeconds: 60,
  chatPollSeconds: 5,
  inventoryIntervalMinutes: 60,
};

function isPermanentToken(token) {
  return typeof token === "string" && token.startsWith("nxd_");
}

function isEnrollmentToken(token) {
  return typeof token === "string" && token.startsWith("nxen_");
}

function isValidToken(token) {
  if (!token || INVALID_TOKENS.has(token)) return false;
  if (token.includes("test_build")) return false;
  return isPermanentToken(token) || isEnrollmentToken(token);
}

function isValidConfig(config) {
  if (!config?.serverUrl?.trim()) return false;
  try {
    const url = new URL(config.serverUrl.trim());
    if (!["http:", "https:"].includes(url.protocol)) return false;
  } catch {
    return false;
  }
  return isValidToken(config.agentToken);
}

function bundledConfigPath() {
  if (app?.isPackaged && process.resourcesPath) {
    return path.join(process.resourcesPath, "build-config.json");
  }
  return path.join(__dirname, "..", "build-config.json");
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Criptografia em repouso do token do agente via DPAPI (Electron safeStorage).
// Antes o token ficava em claro em ProgramData\FunevDesk\config.json, leg\u00EDvel por
// qualquer processo do usu\u00E1rio. Agora \u00E9 cifrado no disco e s\u00F3 decifrado em mem\u00F3ria.
// Fallback transparente: fora do Electron / sem DPAPI, mant\u00E9m o comportamento antigo.
function getSafeStorage() {
  try {
    const { safeStorage } = require("electron");
    if (safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable()) return safeStorage;
  } catch { /* fora do processo Electron ou DPAPI indispon\u00EDvel */ }
  return null;
}

function encryptToken(token) {
  if (!token || typeof token !== "string" || token.startsWith("enc:")) return token;
  const ss = getSafeStorage();
  if (!ss) return token;
  try { return "enc:" + ss.encryptString(token).toString("base64"); } catch { return token; }
}

function decryptToken(token) {
  if (typeof token !== "string" || !token.startsWith("enc:")) return token;
  const ss = getSafeStorage();
  if (!ss) return ""; // n\u00E3o h\u00E1 como decifrar sem DPAPI \u2014 exige novo enrollment
  try { return ss.decryptString(Buffer.from(token.slice(4), "base64")); } catch { return ""; }
}

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Migração de marca: reaproveita a config do diretório antigo (NexusDesk) na
// primeira execução já com o nome novo (FunevDesk), para o agente não perder o
// token e não pedir reconfiguração após o rebranding.
function migrateLegacyConfig() {
  if (process.platform !== "win32") return;
  if (fs.existsSync(CONFIG_PATH)) return;
  const legacyPath = path.join(process.env.ProgramData || "C:\\ProgramData", "NexusDesk", "config.json");
  try {
    if (fs.existsSync(legacyPath)) {
      ensureConfigDir();
      fs.copyFileSync(legacyPath, CONFIG_PATH);
    }
  } catch { /* segue com config nova/limpa */ }
}

function loadConfig() {
  ensureConfigDir();
  migrateLegacyConfig();
  const bundled = readJson(bundledConfigPath());
  const existing = readJson(CONFIG_PATH) || {};
  // Decifra o token salvo (DPAPI) antes de validar/usar.
  if (existing.agentToken) existing.agentToken = decryptToken(existing.agentToken);

  let merged = { ...DEFAULTS, ...existing };

  if (bundled) {
    const bundledValid = isValidToken(bundled.agentToken);
    const existingValid = isValidToken(existing.agentToken);

    if (existingValid) {
      merged = {
        ...DEFAULTS,
        ...bundled,
        ...existing,
        agentToken: existing.agentToken,
        serverUrl: existing.serverUrl || bundled.serverUrl || "",
        agentVersion: bundled.agentVersion || existing.agentVersion || DEFAULTS.agentVersion,
        appName: bundled.appName || existing.appName || DEFAULTS.appName,
        logoUrl: bundled.logoUrl || existing.logoUrl || DEFAULTS.logoUrl,
        primaryColor: bundled.primaryColor || existing.primaryColor || DEFAULTS.primaryColor,
      };
    } else if (bundledValid) {
      merged = {
        ...DEFAULTS,
        ...existing,
        ...bundled,
      };
    } else {
      merged = { ...DEFAULTS, ...bundled, ...existing };
    }
  }

  if (isValidConfig(merged)) {
    saveConfig(merged);
  }

  return merged;
}

function saveConfig(config) {
  ensureConfigDir();
  const normalized = {
    ...DEFAULTS,
    ...config,
    serverUrl: String(config.serverUrl || "").trim().replace(/\/$/, ""),
    agentToken: String(config.agentToken || "").trim(),
    appName: String(config.appName || DEFAULTS.appName).trim(),
    logoUrl: String(config.logoUrl || "").trim(),
    primaryColor: String(config.primaryColor || DEFAULTS.primaryColor).trim(),
  };
  // Em disco o token vai CIFRADO (DPAPI); o objeto retornado mantém o token em
  // claro para uso em memória pelo agente.
  const onDisk = { ...normalized, agentToken: encryptToken(normalized.agentToken) };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(onDisk, null, 2), "utf8");
  return normalized;
}

function appendLog(message) {
  ensureConfigDir();
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(LOG_PATH, line, "utf8");
}

module.exports = {
  CONFIG_DIR,
  CONFIG_PATH,
  LOG_PATH,
  DEFAULTS,
  isPermanentToken,
  isEnrollmentToken,
  isValidToken,
  isValidConfig,
  loadConfig,
  saveConfig,
  appendLog,
  bundledConfigPath,
};
