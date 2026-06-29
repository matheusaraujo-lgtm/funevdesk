const path = require("node:path");
const { BrowserWindow, ipcMain } = require("electron");

// Módulo de popups leves (frameless, always-on-top) para ações rápidas SEM abrir o app principal:
//  - Consentimento de acesso remoto (consent.html)
//  - Resposta rápida de chat de chamado (reply.html)
//
// As dependências (api, ensureAgentReady, webrtc, log) são injetadas via registerPopupIpc
// para reutilizar a lógica já existente em heartbeat.js / api-client.js.

let consentWindow = null;
let replyWindow = null;
let deps = null;

function registerPopupIpc(dependencies) {
  deps = dependencies;

  ipcMain.handle("popup:close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.close();
    return { ok: true };
  });

  ipcMain.handle("popup:remote-accept", async (_event, sessionId) => {
    return acceptRemote(sessionId);
  });

  ipcMain.handle("popup:remote-decline", async (_event, sessionId) => {
    deps?.appendLog(`Acesso remoto recusado via popup: sessão ${sessionId}`);
    return { ok: true };
  });

  ipcMain.handle("popup:reply-send", async (_event, { ticketId, body }) => {
    if (!ticketId || !body?.trim()) return { ok: false, error: "Mensagem vazia." };
    try {
      await deps.ensureAgentReady();
      await deps.sendTicketMessage(ticketId, body.trim());
      deps.appendLog(`Resposta enviada via popup: chamado ${ticketId}`);
      return { ok: true };
    } catch (error) {
      deps.appendLog(`Erro ao responder via popup: ${error.message}`);
      return { ok: false, error: error.message };
    }
  });
}

// Mesma lógica do antigo on('action') da notificação: acknowledge + dispara WebRTC se aplicável.
async function acceptRemote(sessionId) {
  try {
    await deps.ensureAgentReady();
    const pending = await deps.api.get("/api/agent/remote/pending");
    const pendingSession = pending?.session;
    await deps.api.post("/api/agent/remote/acknowledge", { sessionId });
    if (pendingSession?.provider === "NEXUS_WEBRTC" && pendingSession.id === sessionId) {
      deps.startWebRtcHost(sessionId).catch((error) => deps.appendLog(`WebRTC: ${error.message}`));
    }
    deps.appendLog(`Acesso remoto aceito via popup: sessão ${sessionId}`);
    deps.broadcastRemoteAccepted(pendingSession || { id: sessionId });
    return { ok: true };
  } catch (error) {
    deps.appendLog(`Erro ao aceitar acesso remoto via popup: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

function createPopupWindow(file, width, height) {
  const win = new BrowserWindow({
    width,
    height,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "popup-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", file));
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });
  return win;
}

// Abre o popup de consentimento de acesso remoto.
function openConsentPopup(session) {
  if (!session?.id) return;
  if (consentWindow && !consentWindow.isDestroyed()) {
    consentWindow.focus();
    return;
  }
  consentWindow = createPopupWindow("consent.html", 380, 200);
  consentWindow.on("closed", () => { consentWindow = null; });
  const data = {
    sessionId: session.id,
    title: "Solicitação de acesso remoto",
    body: session.message || `${session.requestedByName || "Técnico"} solicita acesso remoto${session.ticketNumber ? ` no chamado #${session.ticketNumber}` : ""}.`,
  };
  consentWindow.webContents.once("did-finish-load", () => {
    if (consentWindow && !consentWindow.isDestroyed()) {
      consentWindow.webContents.send("popup:data", data);
    }
  });
}

// Abre o popup de resposta rápida de chat.
function openReplyPopup(notification) {
  if (!notification?.ticketId) return;
  if (replyWindow && !replyWindow.isDestroyed()) {
    replyWindow.focus();
    return;
  }
  replyWindow = createPopupWindow("reply.html", 420, 220);
  replyWindow.on("closed", () => { replyWindow = null; });
  const data = {
    ticketId: notification.ticketId,
    title: notification.title || "Nova mensagem no chamado",
    body: (notification.body || "").replace(/<[^>]+>/g, " ").slice(0, 180),
  };
  replyWindow.webContents.once("did-finish-load", () => {
    if (replyWindow && !replyWindow.isDestroyed()) {
      replyWindow.webContents.send("popup:data", data);
    }
  });
}

module.exports = {
  registerPopupIpc,
  openConsentPopup,
  openReplyPopup,
};
