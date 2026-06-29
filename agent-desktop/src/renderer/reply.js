let ticketId = null;

const $ = (id) => document.getElementById(id);

window.nexusPopup.onData((data) => {
  ticketId = data.ticketId;
  if (data.title) $("popup-title").textContent = data.title;
  const preview = $("popup-preview");
  if (preview) preview.textContent = data.body || "";
  $("reply-input").focus();
});

async function send() {
  const input = $("reply-input");
  const body = input.value.trim();
  const errEl = $("reply-error");
  errEl.textContent = "";
  if (!ticketId || !body) {
    errEl.textContent = "Digite uma mensagem.";
    return;
  }
  const sendBtn = $("btn-send");
  const cancelBtn = $("btn-cancel");
  sendBtn.disabled = true;
  cancelBtn.disabled = true;
  sendBtn.textContent = "Enviando…";
  try {
    const result = await window.nexusPopup.sendReply(ticketId, body);
    if (result?.ok) {
      window.nexusPopup.close();
    } else {
      errEl.textContent = result?.error || "Falha ao enviar.";
      sendBtn.disabled = false;
      cancelBtn.disabled = false;
      sendBtn.textContent = "Enviar resposta";
    }
  } catch (e) {
    errEl.textContent = e.message || "Falha ao enviar.";
    sendBtn.disabled = false;
    cancelBtn.disabled = false;
    sendBtn.textContent = "Enviar resposta";
  }
}

$("btn-send").addEventListener("click", send);
$("btn-cancel").addEventListener("click", () => window.nexusPopup.close());
$("reply-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    window.nexusPopup.close();
  }
});
