const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexusAgent", {
  getStatus: () => ipcRenderer.invoke("agent:status"),
  getConfig: () => ipcRenderer.invoke("agent:getConfig"),
  saveConfig: (payload) => ipcRenderer.invoke("agent:saveConfig", payload),
  connect: () => ipcRenderer.invoke("agent:connect"),
  waitUntilReady: () => ipcRenderer.invoke("agent:ready"),
  listTickets: (includeResolved = false) => ipcRenderer.invoke("tickets:list", { includeResolved }),
  getTicket: (ticketId) => ipcRenderer.invoke("tickets:get", ticketId),
  getCatalog: () => ipcRenderer.invoke("tickets:catalog"),
  getMessages: (ticketId) => ipcRenderer.invoke("tickets:messages", ticketId),
  sendMessage: (ticketId, body) => ipcRenderer.invoke("tickets:send", { ticketId, body }),
  getNotifications: (since) => ipcRenderer.invoke("tickets:notifications", since),
  showNotification: (payload) => ipcRenderer.invoke("agent:notify", payload),
  openSetup: () => ipcRenderer.invoke("agent:openSetup"),
  checkForUpdate: () => ipcRenderer.invoke("updater:check"),
  acknowledgeRemote: (sessionId) => ipcRenderer.invoke("remote:acknowledge", sessionId),
  getContext: () => ipcRenderer.invoke("agent:context"),
  getInventory: (refresh = false) => ipcRenderer.invoke("agent:inventory", { refresh }),
  uploadFile: async (file) => {
    const buffer = await file.arrayBuffer();
    return ipcRenderer.invoke("agent:upload", {
      fileName: file.name,
      mimeType: file.type,
      buffer: Array.from(new Uint8Array(buffer)),
    });
  },
  onRemotePending: (callback) => {
    ipcRenderer.on("remote-pending", (_event, session) => callback(session));
  },
  onRemoteAccepted: (callback) => {
    ipcRenderer.on("remote-accepted", (_event, session) => callback(session));
  },
  onOpenTicket: (callback) => {
    ipcRenderer.on("open-ticket", (_event, ticketId) => callback(ticketId));
  },
  onTicketNotification: (callback) => {
    ipcRenderer.on("ticket-notification", (_event, notification) => callback(notification));
  },
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window:maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  // Remote session controls
  endSession: (sessionId) => ipcRenderer.invoke("remote:end", sessionId),
  pauseSession: (sessionId) => ipcRenderer.invoke("remote:pause", sessionId),
  remoteChat: (sessionId, message) => ipcRenderer.invoke("remote:chat", { sessionId, message }),
});
