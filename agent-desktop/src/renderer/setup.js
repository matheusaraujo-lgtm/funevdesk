const form = document.getElementById("setup-form");
const errorEl = document.getElementById("error");
const saveBtn = document.getElementById("save-btn");

async function bootstrap() {
  try {
    const config = await window.nexusAgent.getConfig();
    if (config.serverUrl) document.getElementById("serverUrl").value = config.serverUrl;
    if (config.agentToken && !config.agentToken.includes("…")) {
      document.getElementById("agentToken").value = config.agentToken;
    }
  } catch {
    // ignore
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";
  saveBtn.disabled = true;
  saveBtn.textContent = "Conectando…";

  try {
    await window.nexusAgent.saveConfig({
      serverUrl: document.getElementById("serverUrl").value.trim(),
      agentToken: document.getElementById("agentToken").value.trim(),
    });
    await window.nexusAgent.connect();
    window.close();
  } catch (error) {
    errorEl.textContent = error.message || String(error);
    saveBtn.disabled = false;
    saveBtn.textContent = "Salvar e conectar";
  }
});

bootstrap();
