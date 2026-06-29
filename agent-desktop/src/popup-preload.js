const { contextBridge, ipcRenderer } = require("electron");

// Preload mínimo para os popups leves (consentimento de acesso remoto e resposta de chat).
// Expõe apenas o necessário: receber os dados iniciais e disparar as ações no main.
contextBridge.exposeInMainWorld("nexusPopup", {
  // Recebe os dados injetados pelo main quando o popup termina de carregar.
  onData: (callback) => {
    ipcRenderer.on("popup:data", (_event, data) => callback(data));
  },
  // Consentimento de acesso remoto
  acceptRemote: (sessionId) => ipcRenderer.invoke("popup:remote-accept", sessionId),
  declineRemote: (sessionId) => ipcRenderer.invoke("popup:remote-decline", sessionId),
  // Resposta rápida de chat
  sendReply: (ticketId, body) => ipcRenderer.invoke("popup:reply-send", { ticketId, body }),
  // Fecha o próprio popup
  close: () => ipcRenderer.invoke("popup:close"),
});
