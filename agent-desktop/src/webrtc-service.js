const { BrowserWindow, desktopCapturer } = require("electron");
const path = require("node:path");
const api = require("./api-client");

let hostWindow = null;
let activeSessionId = null;

async function startWebRtcHost(sessionId) {
  if (activeSessionId === sessionId && hostWindow && !hostWindow.isDestroyed()) return;

  activeSessionId = sessionId;
  if (hostWindow && !hostWindow.isDestroyed()) hostWindow.close();

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 0, height: 0 },
  });
  const screenSource = sources.find((s) => s.id.startsWith("screen:")) || sources[0];
  if (!screenSource) throw new Error("Nenhuma fonte de captura de tela disponível.");

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
      sourceId: screenSource.id,
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

module.exports = { startWebRtcHost, stopWebRtcHost, pollAndHost };
