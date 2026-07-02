const { BrowserWindow, desktopCapturer } = require("electron");
const path = require("node:path");
const api = require("./api-client");

let hostWindow = null;
let activeSessionId = null;
// STUN/TURN entregues pelo servidor via heartbeat (pendingRemote.iceServers). Default: só STUN.
let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

function setIceServers(servers) {
  if (Array.isArray(servers) && servers.length) iceServers = servers;
}

async function startWebRtcHost(sessionId) {
  if (activeSessionId === sessionId && hostWindow && !hostWindow.isDestroyed()) return;

  activeSessionId = sessionId;
  if (hostWindow && !hostWindow.isDestroyed()) hostWindow.close();

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 0, height: 0 },
  });
  const screens = sources.filter((s) => s.id.startsWith("screen:"));
  // Lista de monitores para o técnico poder alternar quando a máquina tem mais de uma tela.
  const monitors = (screens.length ? screens : sources).map((s, index) => ({
    id: s.id,
    name: s.name || `Monitor ${index + 1}`,
  }));
  if (!monitors.length) throw new Error("Nenhuma fonte de captura de tela disponível.");

  hostWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "webrtc-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  hostWindow.webContents.on("did-finish-load", () => {
    hostWindow.webContents.send("webrtc-config", {
      sessionId,
      sourceId: monitors[0].id,
      monitors,
      iceServers,
    });
  });

  hostWindow.on("closed", () => {
    hostWindow = null;
    if (activeSessionId === sessionId) activeSessionId = null;
  });

  await hostWindow.loadFile(path.join(__dirname, "renderer", "webrtc-host.html"));
}

function stopWebRtcHost() {
  activeSessionId = null;
  if (hostWindow && !hostWindow.isDestroyed()) hostWindow.close();
  hostWindow = null;
}

async function pollAndHost(sessionId) {
  await startWebRtcHost(sessionId);
}

module.exports = { startWebRtcHost, stopWebRtcHost, pollAndHost, setIceServers };
