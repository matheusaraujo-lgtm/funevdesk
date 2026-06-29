const { app } = require("electron");
const { autoUpdater } = require("electron-updater");
const { loadConfig, appendLog } = require("./config");

// Auto-update da frota via electron-updater (canal NSIS).
// O feed é servido pelo próprio servidor em /downloads/agent/updates (latest.yml + Setup.exe + .blockmap).
// Como cada organização aponta para um serverUrl diferente (white-label), a URL do feed é
// definida em runtime a partir do config — não dá para fixá-la no build.
// Observação: o auto-update cobre apenas o instalador NSIS (.exe). O MSI continua existindo
// para distribuição por GPO/Intune, que tem seu próprio mecanismo de atualização.

let started = false;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas

function log(message) {
  try {
    appendLog(`[updater] ${message}`);
  } catch {
    /* logging nunca deve derrubar o agente */
  }
}

function feedUrlFromConfig() {
  const config = loadConfig();
  const base = String(config.serverUrl || "").trim().replace(/\/$/, "");
  if (!base) return null;
  // Segurança: o feed de atualização DEVE ser HTTPS. Um feed HTTP permite a um
  // atacante na rede (MITM) entregar um instalador NSIS adulterado, que seria
  // baixado e executado silenciosamente (RCE na frota). Exceção: localhost em dev.
  // A assinatura Authenticode do instalador ainda é validada pelo electron-updater
  // quando o app é assinado (publisherName no build).
  try {
    const u = new URL(base);
    const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !isLocal) {
      log(`Feed de update recusado: "${base}" não é HTTPS. Auto-update desativado por segurança.`);
      return null;
    }
  } catch {
    return null;
  }
  return `${base}/downloads/agent/updates`;
}

function configureFeed() {
  const url = feedUrlFromConfig();
  if (!url) {
    log("serverUrl ausente no config — auto-update desativado nesta sessão.");
    return false;
  }
  autoUpdater.setFeedURL({ provider: "generic", url, channel: "latest" });
  return true;
}

async function checkNow() {
  if (!configureFeed()) return;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log(`Falha ao checar atualizações: ${error?.message || error}`);
  }
}

function startAutoUpdate() {
  if (started) return;
  // Em desenvolvimento (não empacotado) o electron-updater não funciona e lança erro.
  if (!app.isPackaged) {
    log("Ambiente de desenvolvimento — auto-update desativado.");
    return;
  }
  started = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };

  autoUpdater.on("update-available", (info) => log(`Atualização disponível: v${info?.version}. Baixando em segundo plano…`));
  autoUpdater.on("update-not-available", () => log("Agente já está na versão mais recente."));
  autoUpdater.on("error", (error) => log(`Erro no auto-update: ${error?.message || error}`));
  autoUpdater.on("download-progress", (progress) => log(`Baixando atualização: ${Math.round(progress?.percent || 0)}%`));
  autoUpdater.on("update-downloaded", (info) => {
    log(`Atualização v${info?.version} baixada. Aplicando silenciosamente e reiniciando o agente…`);
    // isSilent=true (instalação NSIS sem UI), isForceRunAfter=true (reabre o agente após instalar).
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch (error) {
        log(`Falha ao aplicar atualização (será tentada ao encerrar): ${error?.message || error}`);
      }
    });
  });

  // Checagem no boot + a cada 6h enquanto o agente roda.
  checkNow();
  const timer = setInterval(checkNow, CHECK_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
}

// Checagem MANUAL disparada pelo botão "Buscar atualização" na interface. Retorna o resultado
// para o renderer dar feedback; havendo versão nova, o fluxo de autoDownload/quitAndInstall
// (configurado em startAutoUpdate) assume e instala em segundo plano.
async function checkForUpdatesInteractive() {
  if (!app.isPackaged) return { status: "dev" };
  if (!configureFeed()) return { status: "no-server" };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    const current = app.getVersion();
    const latest = result?.updateInfo?.version;
    if (latest && latest !== current) return { status: "available", version: latest };
    return { status: "up-to-date", version: current };
  } catch (error) {
    log(`Falha na verificação manual: ${error?.message || error}`);
    return { status: "error", message: error?.message || String(error) };
  }
}

module.exports = { startAutoUpdate, checkNow, checkForUpdatesInteractive };
