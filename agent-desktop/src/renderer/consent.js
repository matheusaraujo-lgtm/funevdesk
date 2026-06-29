let sessionId = null;

const $ = (id) => document.getElementById(id);

window.nexusPopup.onData((data) => {
  sessionId = data.sessionId;
  if (data.title) $("popup-title").textContent = data.title;
  $("popup-message").textContent = data.body || "Um técnico solicita acesso remoto a esta máquina.";
});

$("btn-accept").addEventListener("click", async () => {
  if (!sessionId) return;
  const accept = $("btn-accept");
  const decline = $("btn-decline");
  accept.disabled = true;
  decline.disabled = true;
  accept.textContent = "Conectando…";
  try {
    await window.nexusPopup.acceptRemote(sessionId);
  } finally {
    window.nexusPopup.close();
  }
});

$("btn-decline").addEventListener("click", async () => {
  try {
    if (sessionId) await window.nexusPopup.declineRemote(sessionId);
  } finally {
    window.nexusPopup.close();
  }
});
