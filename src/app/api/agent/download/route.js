import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPermissions, requireCurrentUser } from "@/lib/auth";
import { toServableLogoUrl } from "@/lib/branding";
import { canAccessBranch } from "@/lib/branch-scope";
import { rotateBranchEnrollmentKey } from "@/lib/agent";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Fonte única da versão: o package.json do agente. O manifest.json (gerado no build) tem
// prioridade quando presente; este valor é só o fallback quando ainda não há build publicado.
function readAgentVersion() {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "agent-desktop", "package.json"), "utf8")).version || "1.2.0";
  } catch {
    return "1.2.0";
  }
}
const AGENT_VERSION = readAgentVersion();
const AGENT_DIST_DIR = path.join(process.cwd(), "public", "downloads", "agent");

function fileResponse(body, filename, contentType = "application/octet-stream", extraHeaders = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  return new Response(buffer, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "content-length": String(buffer.length),
      "x-agent-version": AGENT_VERSION,
      ...extraHeaders,
    },
  });
}

async function readAgentManifest() {
  try {
    return JSON.parse(await fs.readFile(path.join(AGENT_DIST_DIR, "manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

function readOrgBranding(db, organizationId) {
  const settings = db.prepare(
    "SELECT app_name, logo_url, primary_color FROM system_settings WHERE organization_id=?",
  ).get(organizationId);
  const org = db.prepare("SELECT name FROM organizations WHERE id=?").get(organizationId);
  return {
    appName: settings?.app_name || org?.name || "FunevDesk",
    logoUrl: toServableLogoUrl(settings?.logo_url),
    primaryColor: settings?.primary_color || "#102033",
  };
}

function electronDownloadNames(type, manifest) {
  const wantsMsi = type === "msi" || type === "gpo-msi";
  if (wantsMsi) {
    return {
      storageName: "FunevDeskAgente.msi",
      downloadName: manifest?.downloadMsi || `FunevDeskAgente-${AGENT_VERSION}.msi`,
      contentType: "application/x-msi",
    };
  }
  return {
    storageName: "FunevDeskAgenteSetup.exe",
    downloadName: manifest?.downloadExe || `FunevDeskAgenteSetup-${AGENT_VERSION}.exe`,
    contentType: "application/octet-stream",
  };
}

async function serveBuiltArtifact(type, built, manifest) {
  const wantsMsi = type === "msi" || type === "gpo-msi";
  const filePath = wantsMsi ? built.msi : built.exe;
  if (!filePath) return null;

  const { downloadName, contentType } = electronDownloadNames(type, manifest);
  const body = await fs.readFile(filePath);
  return fileResponse(body, downloadName, contentType);
}

async function servePrebuiltElectron(type) {
  const manifest = await readAgentManifest();
  if (!manifest || manifest.agentVersion !== AGENT_VERSION) return null;

  const { storageName, downloadName, contentType } = electronDownloadNames(type, manifest);
  const artifactPath = path.join(AGENT_DIST_DIR, storageName);
  try {
    const body = await fs.readFile(artifactPath);
    return fileResponse(body, downloadName, contentType);
  } catch {
    return null;
  }
}

async function serveElectron(type, serverUrl, token, branding) {
  const manifest = await readAgentManifest();
  const prebuilt = await servePrebuiltElectron(type);
  if (prebuilt) return prebuilt;

  if (process.platform !== "win32") {
    return null;
  }

  const wantsMsi = type === "msi" || type === "gpo-msi";
  const tempOutput = await fs.mkdtemp(path.join(os.tmpdir(), "nexusdesk-agent-repack-"));

  try {
    const { repackageElectronAgent, buildElectronAgent } = await import("../../../../../scripts/build-agent-electron.mjs");
    const repackaged = await repackageElectronAgent({
      serverUrl,
      agentToken: token,
      outputDirectory: tempOutput,
      branding,
      targets: wantsMsi ? ["nsis", "msi"] : ["nsis"],
    });
    const response = await serveBuiltArtifact(type, repackaged, manifest);
    if (response) return response;

    const built = await buildElectronAgent({
      serverUrl,
      agentToken: token,
      outputDirectory: tempOutput,
      branding,
    });
    return await serveBuiltArtifact(type, built, manifest);
  } catch (error) {
    console.error("Falha ao preparar instalador Electron:", error);
    return null;
  } finally {
    await fs.rm(tempOutput, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const auth = requireCurrentUser(request);
    if (auth.error) return auth.error;
    if (!getPermissions(auth.user).canConfigure) {
      return Response.json({ error: "Apenas administradores podem baixar o agente." }, { status: 403 });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "exe";
    // URL pública configurada (ex.: https://funevdesk.funev.org.br). Quando o admin acessa o
    // painel pelo próprio servidor (localhost:3000), a origem da requisição NÃO serve para a
    // frota — o agente roda em outras máquinas. Nesse caso usamos a URL pública configurada.
    // Sem APP_PUBLIC_URL, derivamos do primeiro host de AGENT_ALLOWED_SERVER_HOSTS (https),
    // que já costuma estar definido no deploy — assim funciona sem nova variável de ambiente.
    const allowedHostsEnv = (process.env.AGENT_ALLOWED_SERVER_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean);
    let publicUrl = (process.env.APP_PUBLIC_URL || "").trim().replace(/\/$/, "");
    if (!publicUrl && allowedHostsEnv[0]) publicUrl = `https://${allowedHostsEnv[0]}`;
    let publicHost = "";
    try { if (publicUrl) publicHost = new URL(publicUrl).host; } catch { /* URL pública inválida: ignorada */ }
    let requestedServerUrl = url.searchParams.get("serverUrl") || url.origin;
    try {
      const reqHost = new URL(requestedServerUrl).hostname;
      const isLoopback = ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(reqHost);
      if (publicUrl && isLoopback) requestedServerUrl = publicUrl;
    } catch {
      if (publicUrl) requestedServerUrl = publicUrl;
    }
    // O serverUrl é embutido no agente (que roda como SYSTEM) e define para onde ele
    // se reporta. Validar contra a própria origem + allow-list evita gerar um instalador
    // que aponte a frota para um servidor malicioso (C2).
    const allowedHosts = new Set([
      url.host,
      ...(publicHost ? [publicHost] : []),
      ...allowedHostsEnv,
    ]);
    let serverUrl;
    try {
      const parsed = new URL(requestedServerUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("scheme");
      if (!allowedHosts.has(parsed.host)) {
        return Response.json({ error: `serverUrl não autorizado: ${parsed.host}. Configure AGENT_ALLOWED_SERVER_HOSTS.` }, { status: 400 });
      }
      serverUrl = parsed.origin;
    } catch {
      return Response.json({ error: "serverUrl inválido." }, { status: 400 });
    }
    const agentToken = url.searchParams.get("agentToken") || "";
    const enrollmentKey = url.searchParams.get("enrollmentKey") || "";
    const requestedBranchId = (url.searchParams.get("branchId") || "").trim();
    let token = agentToken || enrollmentKey;

    if (type === "manifest" || type === "info") {
      const manifest = await readAgentManifest();
      const db = getDb();
      const branding = readOrgBranding(db, auth.user.organization_id);
      return Response.json({
        agentVersion: manifest?.agentVersion || AGENT_VERSION,
        downloadExe: manifest?.downloadExe || `FunevDeskAgenteSetup-${AGENT_VERSION}.exe`,
        downloadMsi: manifest?.downloadMsi || `FunevDeskAgente-${AGENT_VERSION}.msi`,
        generatedAt: manifest?.generatedAt || null,
        appName: branding.appName,
      });
    }

    // Opcional: se uma unidade for passada (fluxo de repack/Windows), embute a chave dela.
    // No fluxo padrão o instalador é GENÉRICO e a unidade é definida na instalação pela chave
    // da filial (config.json), então `token` pode ficar vazio aqui sem problema.
    if (requestedBranchId) {
      const db = getDb();
      if (!canAccessBranch(auth.user, requestedBranchId)) {
        return Response.json({ error: "Sem acesso à unidade selecionada." }, { status: 403 });
      }
      const minted = rotateBranchEnrollmentKey(db, auth.user.organization_id, requestedBranchId);
      if (!minted) return Response.json({ error: "Unidade inválida." }, { status: 400 });
      token = minted.plaintextOnce;
    }

    if (type === "exe" || type === "gpo-exe" || type === "msi" || type === "gpo-msi") {
      const db = getDb();
      const branding = readOrgBranding(db, auth.user.organization_id);
      const electronFile = await serveElectron(type, serverUrl, token, branding);
      if (electronFile) return electronFile;

      return Response.json({
        error: `Instalador v${AGENT_VERSION} indisponível. Execute npm run build:agent no servidor Windows.`,
      }, { status: 500 });
    }

  if (type === "installer") {
    return Response.json({
      error: "Use type=exe para baixar o instalador. Pacotes ZIP foram desativados.",
    }, { status: 400 });
  }

    return Response.json({ error: "Tipo de download inválido." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || "Erro ao gerar download." }, { status: 500 });
  }
}
