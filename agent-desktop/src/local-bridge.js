const http = require("node:http");
const os = require("node:os");
const { loadConfig } = require("./config");

const PORT = 47832;
let server = null;
let cachedAssetId = null;
let cachedBranchId = null;

function updateAssetCache(assetId, branchId) {
  cachedAssetId = assetId || null;
  cachedBranchId = branchId || null;
}

// Só libera CORS para a origem do PRÓPRIO servidor FunevDesk configurado.
// Antes era `*`, o que permitia que QUALQUER site aberto no navegador lesse a
// identidade da máquina (hostname/assetId/usuário/IP) via fetch para o loopback.
function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  try {
    const serverOrigin = new URL(loadConfig().serverUrl).origin;
    if (origin === serverOrigin) return origin;
  } catch { /* serverUrl inválido */ }
  return null;
}

function startLocalBridge(getAssetInfo) {
  if (server) return;

  server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      // Chrome (Private/Local Network Access) envia um preflight com
      // `Access-Control-Request-Private-Network: true` antes de qualquer fetch
      // de uma página para o loopback. Só ecoamos o allow para a origem permitida.
      const origin = allowedOrigin(req);
      const headers = {
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-allow-private-network": "true",
        "vary": "Origin",
      };
      if (origin) headers["access-control-allow-origin"] = origin;
      res.writeHead(204, headers);
      res.end();
      return;
    }

    if (req.method === "GET" && (req.url === "/api/local" || req.url === "/api/local/")) {
      const config = loadConfig();
      try {
        // Hostname via os.hostname() (instantâneo). NÃO chamamos collectTelemetry aqui:
        // a coleta de sistema (CPU/disco/rede) levava 1-2,5s e fazia a auto-detecção
        // do formulário de chamado abortar por timeout. Este endpoint só precisa identificar a máquina.
        const hostname = os.hostname();

        // Try cached first (fast path), then fetch from server
        let assetId = cachedAssetId;
        let branchId = cachedBranchId;

        if (!assetId && typeof getAssetInfo === "function") {
          try {
            const assetInfo = await getAssetInfo();
            assetId = assetInfo?.id || null;
            branchId = assetInfo?.branchId || null;
            cachedAssetId = assetId;
            cachedBranchId = branchId;
          } catch {
            // server not available yet
          }
        }

        const origin = allowedOrigin(req);
        const headers = {
          "content-type": "application/json",
          "access-control-allow-private-network": "true",
          "vary": "Origin",
        };
        if (origin) headers["access-control-allow-origin"] = origin;
        res.writeHead(200, headers);
        // Payload mínimo para auto-detecção da máquina. `loggedUser` e `ipAddress`
        // foram REMOVIDOS — eram dados sensíveis e desnecessários para vincular o ativo.
        res.end(JSON.stringify({
          ok: true,
          serverUrl: config.serverUrl,
          hostname,
          assetId,
          branchId,
        }));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: error.message }));
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(PORT, "127.0.0.1", () => {
    // bridge ready on localhost only
  });
}

function stopLocalBridge() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { startLocalBridge, stopLocalBridge, updateAssetCache, LOCAL_BRIDGE_PORT: PORT };
