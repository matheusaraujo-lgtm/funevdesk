const fs = require("node:fs");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
} = require("electron");
const { loadConfig, saveConfig, appendLog, isValidConfig } = require("./config");
const api = require("./api-client");
const { ensureAgentReady } = require("./auth");
const { startLocalBridge, stopLocalBridge, updateAssetCache } = require("./local-bridge");
const { startAutoUpdate, checkForUpdatesInteractive } = require("./updater");
const {
  startHeartbeatService,
  stopHeartbeatService,
  restartHeartbeatService,
  registerHeartbeatIpc,
  setStatusCallback,
  sendHeartbeat,
} = require("./heartbeat");

let tray = null;
let chatWindow = null;
let setupWindow = null;
let isOnline = false;

// Nome da marca (white-label) lido do config; cai para "FunevDesk" se ausente.
function getAppName() {
  try {
    return loadConfig().appName || "FunevDesk";
  } catch {
    return "FunevDesk";
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (setupWindow) {
      setupWindow.show();
      setupWindow.focus();
      return;
    }
    if (chatWindow) {
      if (chatWindow.isMinimized()) chatWindow.restore();
      chatWindow.show();
      chatWindow.focus();
    } else {
      createChatWindow();
    }
  });
}

function getTrayIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icon.ico");
  }
  return path.join(__dirname, "..", "build", "icon.ico");
}

function createTrayIcon() {
  const iconPath = getTrayIconPath();
  if (fs.existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      return image.resize({ width: 16, height: 16 });
    }
  }

  const fallback = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAuppXAAAAF0lEQVR42mP8z8BQz0AEYBxVSFUBALMBC/qYCE2YAAAAAElFTkSuQmCC",
  );
  return fallback.resize({ width: 16, height: 16 });
}

function updateTrayTooltip(detail) {
  if (!tray) return;
  tray.setImage(createTrayIcon());
  tray.setToolTip(`${getAppName()} Agent — ${isOnline ? "Online" : "Offline"}${detail ? ` (${detail})` : ""}`);
}

function createSetupWindow() {
  if (setupWindow) {
    setupWindow.show();
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 560,
    height: 520,
    resizable: false,
    title: `Configurar ${getAppName()} Agent`,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  setupWindow.loadFile(path.join(__dirname, "renderer", "setup.html"));
  setupWindow.on("closed", () => {
    setupWindow = null;
  });
}

function createChatWindow() {
  if (!isValidConfig(loadConfig())) {
    createSetupWindow();
    return;
  }

  void openChatWindowWhenReady();
}

async function openChatWindowWhenReady() {
  try {
    await ensureAgentReady();
  } catch (error) {
    appendLog(`Conexão do agente falhou: ${error.message}`);
    createSetupWindow();
    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.webContents.once("did-finish-load", () => {
        setupWindow.webContents.executeJavaScript(
          `document.getElementById("error").textContent = ${JSON.stringify(error.message || "Falha ao conectar.")};`,
        ).catch(() => {});
      });
    }
    return;
  }

  if (chatWindow) {
    chatWindow.show();
    chatWindow.focus();
    return;
  }

  chatWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: `${getAppName()} — Suporte`,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  chatWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  chatWindow.on("closed", () => {
    chatWindow = null;
  });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Abrir chamados",
      click: () => createChatWindow(),
    },
    {
      label: "Configurar agente",
      click: () => createSetupWindow(),
    },
    { type: "separator" },
    {
      label: isOnline ? "Status: Online" : "Status: Offline",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        stopHeartbeatService();
        app.quit();
      },
    },
  ]);
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip(`${getAppName()} Agent`);
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", () => createChatWindow());
  tray.on("double-click", () => createChatWindow());
  updateTrayTooltip("");
}

function setupAutoLaunch() {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: [],
  });
}

async function bootstrapAgent() {
  const config = loadConfig();
  if (!isValidConfig(config)) {
    appendLog("Configuração inválida ou ausente — abrindo assistente de configuração.");
    notifyOffline("Não configurado");
    createSetupWindow();
    return;
  }

  await startHeartbeatService();
}

function notifyOffline(detail) {
  isOnline = false;
  updateTrayTooltip(detail);
  if (tray) tray.setContextMenu(buildTrayMenu());
}

app.whenReady().then(async () => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.funev.funevdesk.agent");
  }

  registerHeartbeatIpc();
  api.registerHeartbeatRetry(sendHeartbeat);
  setupAutoLaunch();
  createTray();

  setStatusCallback(({ online, detail }) => {
    isOnline = online;
    updateTrayTooltip(detail);
    if (tray) tray.setContextMenu(buildTrayMenu());
  });

  ipcMain.handle("agent:getConfig", async () => loadConfig());

  ipcMain.handle("agent:saveConfig", async (_event, payload) => {
    const saved = saveConfig({
      ...loadConfig(),
      ...payload,
    });
    if (!isValidConfig(saved)) {
      throw new Error("Informe a URL do servidor e uma chave nxen_… ou token nxd_… válidos.");
    }
    appendLog(`Configuração salva: server=${saved.serverUrl}`);
    return saved;
  });

  ipcMain.handle("agent:connect", async () => {
    await restartHeartbeatService();
    await ensureAgentReady();
    return { ok: true };
  });

  ipcMain.handle("updater:check", async () => checkForUpdatesInteractive());

  ipcMain.handle("agent:openSetup", async () => {
    createSetupWindow();
    return { ok: true };
  });

  ipcMain.handle("window:minimize", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });

  ipcMain.handle("window:maximize", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
  });

  ipcMain.handle("window:close", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });

  await bootstrapAgent();
  startAutoUpdate();
  startLocalBridge(async () => {
    try {
      const ctx = await api.get("/api/agent/context");
      const assetId = ctx.asset?.id || null;
      const branchId = ctx.asset?.branchId || null;
      // Cache for fast access
      updateAssetCache(assetId, branchId);
      return { id: assetId, branchId };
    } catch {
      return {};
    }
  });
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});
