const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("webrtcBridge", {
  onConfig: (callback) => {
    ipcRenderer.on("webrtc-config", (_event, config) => callback(config));
  },
  postSignal: (sessionId, payload) => ipcRenderer.invoke("webrtc:signal", { sessionId, payload }),
  pollSignals: (sessionId, since) => ipcRenderer.invoke("webrtc:poll", { sessionId, since }),
  simulateInput: (action, params) => ipcRenderer.invoke("webrtc:simulate", { action, params }),
  saveFile: (fileName, base64Data) => ipcRenderer.invoke("webrtc:saveFile", { fileName, base64Data }),
});
