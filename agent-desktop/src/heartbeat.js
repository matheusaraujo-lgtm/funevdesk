const { BrowserWindow, Notification, ipcMain } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const api = require("./api-client");
const { ensureAgentReady, registerHeartbeatSender, resetToBundledEnrollmentIfNeeded } = require("./auth");
const { loadConfig, saveConfig, appendLog, isPermanentToken, DEFAULTS } = require("./config");
const { processCommands, drainResults } = require("./incident-response");
const { collectInventory, collectTelemetry } = require("./inventory");
const { startWebRtcHost, stopWebRtcHost } = require("./webrtc-service");
const { simulateInput } = require("./input-simulator");
const { registerPopupIpc, openConsentPopup, openReplyPopup } = require("./popups");

const pkg = require(path.join(__dirname, "..", "package.json"));

let heartbeatTimer = null;
let remotePollTimer = null;
let running = false;
let lastInventoryAt = 0;
let lastInventorySnapshot = null;
let lastNotifiedRemoteId = null;
let lastNotificationPollAt = new Date().toISOString();
let statusCallback = null;
let enrollmentReady = false;
let enrollmentReadyResolvers = [];

function setStatusCallback(callback) {
  statusCallback = callback;
}

function notifyStatus(online, detail) {
  if (statusCallback) statusCallback({ online, detail });
}

// Persiste o branding (white-label) recebido do servidor no config local,
// para que main.js use o appName correto (ex.: "FunevDesk") em bandeja e janelas.
function persistBranding(branding) {
  if (!branding) return;
  const config = loadConfig();
  const updates = {};
  if (branding.appName && branding.appName !== config.appName) updates.appName = branding.appName;
  if (branding.logoUrl !== undefined && branding.logoUrl !== config.logoUrl) updates.logoUrl = branding.logoUrl;
  if (branding.primaryColor && branding.primaryColor !== config.primaryColor) updates.primaryColor = branding.primaryColor;
  if (Object.keys(updates).length === 0) return;
  saveConfig({ ...config, ...updates });
  appendLog(`Branding atualizado do servidor: appName=${updates.appName || config.appName}`);
}

function markEnrollmentReady() {
  if (enrollmentReady) return;
  enrollmentReady = true;
  for (const resolve of enrollmentReadyResolvers) resolve();
  enrollmentReadyResolvers = [];
}

function waitForEnrollmentReady() {
  if (enrollmentReady) return Promise.resolve();
  return new Promise((resolve) => enrollmentReadyResolvers.push(resolve));
}

function focusMainWindow() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  }
}

// Helper reutilizável para enviar mensagem em um chamado (usado pelo IPC tickets:send e pelos popups).
function sendTicketMessage(ticketId, body) {
  return api.post(`/api/agent/tickets/${ticketId}/messages`, { body });
}

// Avisa janelas abertas (se houver) que o acesso remoto foi aceito, sem forçar a abertura do app.
function broadcastRemoteAccepted(session) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("remote-pending", session);
      win.webContents.send("remote-accepted", session);
    }
  }
}

function showTicketNotification(notification) {
  if (!notification?.title) return;

  if (Notification.isSupported()) {
    const item = new Notification({
      title: notification.title,
      body: (notification.body || "").replace(/<[^>]+>/g, " ").slice(0, 180),
      actions: [
        { type: "button", text: "Responder" },
        { type: "button", text: "Abrir chamado" },
      ],
      silent: false,
    });

    item.on("action", (event, index) => {
      if (index === 0) {
        // Responder: abre o popup leve de resposta (sem abrir o app principal).
        openReplyPopup(notification);
      } else {
        // Abrir chamado: alternativa que abre o app principal no chamado.
        focusMainWindow();
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send("open-ticket", notification.ticketId || notification.id);
          }
        }
      }
    });

    // Clique no corpo da notificação abre o popup de resposta rápida.
    item.on("click", () => {
      openReplyPopup(notification);
    });

    item.show();
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("ticket-notification", notification);
    }
  }
}

async function pollTicketNotifications() {
  if (!enrollmentReady) return;
  try {
    const since = encodeURIComponent(lastNotificationPollAt);
    const result = await api.get(`/api/agent/notifications?since=${since}`);
    const notifications = result?.notifications || [];
    if (!notifications.length) return;

    for (const notification of notifications) {
      lastNotificationPollAt = notification.createdAt;
      showTicketNotification(notification);
    }
  } catch {
    // notification polling is best-effort
  }
}

function showRemoteConsentNotification(session) {
  if (!session?.id || session.id === lastNotifiedRemoteId) return;
  lastNotifiedRemoteId = session.id;

  // Aparece NA TELA do colaborador automaticamente (popup de consentimento), não só na notificação.
  openConsentPopup(session);

  const title = "Solicitação de acesso remoto";
  const body = session.message || `${session.requestedByName || "Técnico"} solicita acesso remoto${session.ticketNumber ? ` no chamado #${session.ticketNumber}` : ""}.`;

  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      actions: [
        { type: "button", text: "Aceitar acesso" },
        { type: "button", text: "Recusar" },
      ],
      silent: false,
    });

    // No Windows os botões de ação não são confiáveis; tanto o botão "Aceitar acesso"
    // quanto o clique na notificação abrem o popup leve de consentimento (sem abrir o app principal).
    notification.on("action", (event, index) => {
      if (index === 0) {
        openConsentPopup(session);
      } else {
        appendLog(`Acesso remoto recusado via notificação: sessão ${session.id}`);
      }
    });

    notification.on("click", () => {
      openConsentPopup(session);
    });

    notification.show();
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("remote-pending", session);
    }
  }
}

async function sendHeartbeat(includeInventory) {
  const config = loadConfig();
  if (!config.serverUrl || !config.agentToken) {
    notifyStatus(false, "Não configurado");
    return false;
  }

  try {
    let telemetry;
    let inventory = null;

    if (includeInventory) {
      const collected = await collectInventory();
      telemetry = collected.telemetry;
      inventory = collected.inventory;
      lastInventorySnapshot = inventory;
      if (collected.inventoryError) {
        appendLog(`Inventário parcial: ${collected.inventoryError}`);
      }
    } else {
      telemetry = await collectTelemetry();
    }

    // Os ícones de software (base64) são só para a UI local do agente — não vão
    // ao servidor para não inflar o banco. O EPP (ameaças) é mantido no payload.
    let serverInventory = inventory;
    if (inventory?.installedSoftware?.length) {
      serverInventory = {
        ...inventory,
        installedSoftware: inventory.installedSoftware.map(({ icon, ...rest }) => rest),
      };
    }

    const payload = {
      ...telemetry,
      ...(serverInventory ? { inventory: serverInventory } : {}),
      // Versão do agente, para a frota mostrar quem já atualizou.
      agentVersion: config.agentVersion || pkg.version,
      // Resultados de comandos de resposta a incidente executados desde o último heartbeat.
      commandResults: drainResults(),
    };

    const response = await api.post("/api/agent/heartbeat", payload);

    // Executa comandos de resposta a incidente enviados pelo servidor (isolar/scan).
    if (response.commands) {
      processCommands(response.commands, config).catch((e) => appendLog(`[resposta] erro: ${e?.message || e}`));
    }

    if (response.agentToken && response.agentToken !== config.agentToken) {
      const updated = loadConfig();
      updated.agentToken = response.agentToken;
      saveConfig(updated);
      appendLog("Token permanente registrado após enrollment.");
    }

    if (response.pendingRemote) {
      showRemoteConsentNotification(response.pendingRemote);
    }

    markEnrollmentReady();
    notifyStatus(true, response.status || "ONLINE");
    return true;
  } catch (error) {
    if (/401|não autorizado|nao autorizado/i.test(error.message)) {
      resetToBundledEnrollmentIfNeeded();
    }
    appendLog(`Heartbeat falhou: ${error.message}`);
    notifyStatus(false, error.message);
    return false;
  }
}

async function pollRemotePending() {
  if (!enrollmentReady) return;
  try {
    const result = await api.get("/api/agent/remote/pending");
    if (result?.session) {
      showRemoteConsentNotification(result.session);
    }
  } catch {
    // heartbeat may already include pending remote
  }
}

function shouldCollectInventory(config) {
  const intervalMs = (config.inventoryIntervalMinutes || 60) * 60 * 1000;
  return Date.now() - lastInventoryAt >= intervalMs;
}

async function heartbeatTick() {
  const config = loadConfig();
  const includeInventory = shouldCollectInventory(config);
  await sendHeartbeat(includeInventory);
  if (includeInventory) lastInventoryAt = Date.now();

  await pollRemotePending();
  await pollTicketNotifications();
}

async function startHeartbeatService() {
  if (running) return;
  running = true;

  registerHeartbeatSender(sendHeartbeat);
  appendLog("Serviço de heartbeat iniciado.");
  lastInventoryAt = Date.now();

  const config = loadConfig();
  if (!config.serverUrl || !config.agentToken) {
    notifyStatus(false, "Não configurado");
    running = false;
    return;
  }

  appendLog(`Config: server=${config.serverUrl} token=${config.agentToken.slice(0, 12)}…`);

  const intervalMs = Math.max(15, config.heartbeatSeconds || 60) * 1000;

  // Primeiro heartbeat já envia o inventário completo, para a tela do ativo popular
  // logo após instalar/reiniciar o agente (sem esperar o ciclo de ~60 min).
  await sendHeartbeat(true);
  lastInventoryAt = Date.now();

  if (isPermanentToken(loadConfig().agentToken)) {
    markEnrollmentReady();
  }

  heartbeatTimer = setInterval(() => {
    heartbeatTick().catch((error) => appendLog(`Heartbeat tick: ${error.message}`));
  }, intervalMs);

  // Fast polling for remote requests — every 8 seconds
  if (remotePollTimer) clearInterval(remotePollTimer);
  remotePollTimer = setInterval(() => {
    if (enrollmentReady) pollRemotePending().catch(() => {});
  }, 8000);
}

function stopHeartbeatService() {
  running = false;
  enrollmentReady = false;
  enrollmentReadyResolvers = [];
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (remotePollTimer) {
    clearInterval(remotePollTimer);
    remotePollTimer = null;
  }
}

async function restartHeartbeatService() {
  stopHeartbeatService();
  lastNotifiedRemoteId = null;
  await startHeartbeatService();
}

function registerHeartbeatIpc() {
  // Registra os handlers IPC dos popups leves, injetando as dependências
  // (API, enrollment, WebRTC, log e o helper de mensagens) para reutilizar a lógica existente.
  registerPopupIpc({
    api,
    ensureAgentReady,
    startWebRtcHost,
    appendLog,
    sendTicketMessage,
    broadcastRemoteAccepted,
  });

  ipcMain.handle("agent:status", async () => {
    await waitForEnrollmentReady().catch(() => {});
    const config = loadConfig();
    return {
      serverUrl: config.serverUrl,
      agentToken: config.agentToken ? `${config.agentToken.slice(0, 8)}…` : "",
      version: config.agentVersion || pkg.version,
      appName: config.appName || DEFAULTS.appName,
      logoUrl: config.logoUrl || "",
      primaryColor: config.primaryColor || DEFAULTS.primaryColor,
      online: enrollmentReady,
    };
  });

  ipcMain.handle("agent:ready", async () => {
    await ensureAgentReady();
    return { ok: true };
  });

  ipcMain.handle("tickets:list", async (_event, { includeResolved } = {}) => {
    await ensureAgentReady();
    const query = includeResolved ? "?includeResolved=1" : "";
    const result = await api.get(`/api/agent/tickets${query}`);
    return result.tickets || [];
  });

  ipcMain.handle("tickets:get", async (_event, ticketId) => {
    await ensureAgentReady();
    return api.get(`/api/agent/tickets/${ticketId}`);
  });

  ipcMain.handle("tickets:catalog", async () => {
    await ensureAgentReady();
    const result = await api.get("/api/agent/catalog");
    return result.catalog || [];
  });

  ipcMain.handle("tickets:notifications", async (_event, since) => {
    await ensureAgentReady();
    const query = since ? `?since=${encodeURIComponent(since)}` : "";
    const result = await api.get(`/api/agent/notifications${query}`);
    return result.notifications || [];
  });

  ipcMain.handle("agent:notify", async (_event, payload) => {
    showTicketNotification(payload);
    return { ok: true };
  });

  ipcMain.handle("tickets:messages", async (_event, ticketId) => {
    await ensureAgentReady();
    return api.get(`/api/agent/tickets/${ticketId}/messages`);
  });

  ipcMain.handle("tickets:send", async (_event, { ticketId, body }) => {
    await ensureAgentReady();
    return sendTicketMessage(ticketId, body);
  });

  ipcMain.handle("remote:acknowledge", async (_event, sessionId) => {
    await ensureAgentReady();
    const pending = await api.get("/api/agent/remote/pending");
    const session = pending?.session;
    await api.post("/api/agent/remote/acknowledge", { sessionId });
    if (session?.provider === "NEXUS_WEBRTC" && session.id === sessionId) {
      startWebRtcHost(sessionId).catch((error) => appendLog(`WebRTC: ${error.message}`));
    }
    return { ok: true };
  });

  ipcMain.handle("remote:end", async (_event, sessionId) => {
    await ensureAgentReady();
    try {
      await api.post(`/api/agent/remote/${sessionId}/end`, {});
      stopWebRtcHost(sessionId);
    } catch (e) {
      appendLog(`Erro ao encerrar sessão: ${e.message}`);
    }
    return { ok: true };
  });

  ipcMain.handle("remote:pause", async (_event, sessionId) => {
    await ensureAgentReady();
    try {
      await api.post(`/api/agent/remote/${sessionId}/pause`, {});
    } catch (e) {
      appendLog(`Erro ao pausar sessão: ${e.message}`);
    }
    return { ok: true };
  });

  ipcMain.handle("remote:chat", async (_event, { sessionId, message }) => {
    await ensureAgentReady();
    try {
      await api.post(`/api/agent/remote/${sessionId}/chat`, { message });
    } catch (e) {
      appendLog(`Erro ao enviar chat: ${e.message}`);
    }
    return { ok: true };
  });

  ipcMain.handle("webrtc:signal", async (_event, { sessionId, payload }) => {
    await ensureAgentReady();
    return api.post(`/api/agent/remote/${sessionId}/signal`, payload);
  });

  ipcMain.handle("webrtc:poll", async (_event, { sessionId, since }) => {
    await ensureAgentReady();
    const query = since ? `?since=${encodeURIComponent(since)}` : "";
    const result = await api.get(`/api/agent/remote/${sessionId}/signal${query}`);
    return result.signals || [];
  });

  ipcMain.handle("webrtc:simulate", async (_event, { action, params }) => {
    await simulateInput(action, params);
    return { ok: true };
  });

  ipcMain.handle("webrtc:saveFile", async (_event, { fileName, base64Data }) => {
    const downloadsDir = path.join(os.homedir(), "Downloads", "FunevDesk_Remote");
    fs.mkdirSync(downloadsDir, { recursive: true });
    const safeName = fileName.replace(/[<>:"/\\|?*]/g, "_");
    const dest = path.join(downloadsDir, safeName);
    const buf = Buffer.from(base64Data, "base64");
    fs.writeFileSync(dest, buf);
    appendLog(`Arquivo recebido via remoto: ${safeName} (${buf.length} bytes) -> ${dest}`);
    return { ok: true, path: dest };
  });

  ipcMain.handle("agent:inventory", async (_event, { refresh } = {}) => {
    if (!refresh && lastInventorySnapshot) {
      return { inventory: lastInventorySnapshot, telemetry: null };
    }
    try {
      const collected = await collectInventory();
      if (collected.inventory) {
        lastInventorySnapshot = collected.inventory;
        appendLog(`Inventário coletado com sucesso: ${collected.inventory.installedSoftware?.length || 0} softwares, ${collected.inventory.antivirus?.length || 0} antivírus.`);
      } else {
        appendLog(`Inventário parcial: ${collected.inventoryError || "dados incompletos"}`);
      }
      return collected;
    } catch (error) {
      appendLog(`Erro ao coletar inventário: ${error.message}`);
      return { telemetry: await collectTelemetry().catch(() => ({})), inventory: null, inventoryError: error.message };
    }
  });

  ipcMain.handle("agent:context", async () => {
    await ensureAgentReady();
    const context = await api.get("/api/agent/context");
    persistBranding(context?.branding);
    return context;
  });

  ipcMain.handle("agent:upload", async (_event, payload) => {
    await ensureAgentReady();
    const config = loadConfig();
    const buf = Buffer.from(payload.buffer);
    const blob = new Blob([buf], { type: payload.mimeType || "application/octet-stream" });
    const form = new FormData();
    form.append("arquivo", blob, payload.fileName || "upload.bin");
    const response = await fetch(`${config.serverUrl.replace(/\/$/, "")}/api/agent/uploads`, {
      method: "POST",
      headers: { "x-agent-token": config.agentToken },
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Falha no upload.");
    return result;
  });
}

module.exports = {
  startHeartbeatService,
  stopHeartbeatService,
  restartHeartbeatService,
  registerHeartbeatIpc,
  setStatusCallback,
  sendHeartbeat,
};
