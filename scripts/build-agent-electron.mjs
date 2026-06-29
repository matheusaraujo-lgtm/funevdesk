import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Fonte única da versão: o package.json do agente (a mesma que o electron-builder/updater usam).
export const AGENT_VERSION = JSON.parse(
  readFileSync(new URL("../agent-desktop/package.json", import.meta.url), "utf8"),
).version;

async function runNpm(args, cwd, timeout = 900000) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  await execFileAsync(npmCmd, args, {
    cwd,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    timeout,
    shell: process.platform === "win32",
  });
}

async function runNpx(args, cwd, timeout = 600000) {
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  await execFileAsync(npxCmd, args, {
    cwd,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    timeout,
    shell: process.platform === "win32",
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const agentDesktopDir = path.join(root, "agent-desktop");

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=");
    args.set(key, inline ?? argv[index + 1]);
  }
  return args;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildConfigObject(serverUrl, agentToken, branding = {}) {
  const base = (serverUrl || "http://localhost:3000").replace(/\/$/, "");
  let logoUrl = branding.logoUrl || "";
  if (logoUrl.startsWith("/")) logoUrl = `${base}${logoUrl}`;

  return {
    serverUrl: base,
    agentToken: agentToken || "",
    agentVersion: AGENT_VERSION,
    appName: branding.appName || "FunevDesk",
    logoUrl,
    primaryColor: branding.primaryColor || "#102033",
    heartbeatSeconds: 60,
    chatPollSeconds: 5,
    inventoryIntervalMinutes: 60,
  };
}

async function writeBuildConfigFiles(config) {
  const json = JSON.stringify(config, null, 2);
  await fs.writeFile(path.join(agentDesktopDir, "build-config.json"), json, "utf8");
  const unpackedConfig = path.join(agentDesktopDir, "dist", "win-unpacked", "resources", "build-config.json");
  if (await pathExists(unpackedConfig)) {
    await fs.writeFile(unpackedConfig, json, "utf8");
  }
}

async function copyFileSafe(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.unlink(target);
  } catch {
    // target may not exist or be locked briefly
  }
  try {
    await fs.copyFile(source, target);
    return;
  } catch (error) {
    if (error?.code !== "UNKNOWN" && error?.code !== "EPERM" && error?.code !== "EBUSY") {
      throw error;
    }
  }

  const data = await fs.readFile(source);
  await fs.writeFile(target, data);
}

async function copyDistArtifacts(distDir, outputDirectory) {
  await fs.mkdir(outputDirectory, { recursive: true });

  const artifacts = {
    exe: null,
    msi: null,
  };

  const entries = await fs.readdir(distDir);

  // Seleciona o artefato mais recente (por mtime) de cada tipo. Escolher pelo nome/ordem
  // alfabética é frágil: sobras de builds anteriores com nomes legados (ex.: pré-rebranding)
  // ainda em dist/ podiam ser copiadas no lugar do build recém-gerado.
  async function newestMatching(predicate) {
    let best = null;
    for (const entry of entries) {
      if (!predicate(entry.toLowerCase())) continue;
      const source = path.join(distDir, entry);
      const { mtimeMs } = await fs.stat(source);
      if (!best || mtimeMs > best.mtimeMs) best = { source, mtimeMs };
    }
    return best?.source || null;
  }

  const setupSource = await newestMatching(
    (lower) => lower.endsWith(".exe") && !lower.includes("unpacked") && !lower.includes("uninstaller"),
  );
  const msiSource = await newestMatching((lower) => lower.endsWith(".msi"));

  if (setupSource) {
    const target = path.join(outputDirectory, "FunevDeskAgenteSetup.exe");
    await copyFileSafe(setupSource, target);
    artifacts.exe = target;
  }
  if (msiSource) {
    const target = path.join(outputDirectory, "FunevDeskAgente.msi");
    await copyFileSafe(msiSource, target);
    artifacts.msi = target;
  }

  return artifacts;
}

// Copia os artefatos que o electron-updater precisa para o feed público:
// latest.yml (metadados + checksum), o instalador NSIS e o .blockmap (delta).
// Os nomes dos arquivos são lidos do próprio latest.yml (campos url:/path:), tornando a cópia
// robusta a qualquer artifactName — eles preservam o nome versionado, pois o latest.yml os
// referencia por nome, e por isso vão para uma pasta separada (updates/), não renomeados.
async function copyUpdateFeed(distDir, root) {
  const latestYmlPath = path.join(distDir, "latest.yml");
  let latestYml;
  try {
    latestYml = await fs.readFile(latestYmlPath, "utf8");
  } catch {
    console.warn("Aviso: latest.yml não foi gerado — o auto-update (electron-updater) não funcionará. Verifique o bloco 'publish' do package.json do agente.");
    return [];
  }

  const feedDir = path.join(root, "public", "downloads", "agent", "updates");
  await fs.mkdir(feedDir, { recursive: true });
  await copyFileSafe(latestYmlPath, path.join(feedDir, "latest.yml"));

  // Arquivos referenciados no latest.yml (url:/path:). Copia cada um + seu .blockmap, se houver.
  const referenced = new Set();
  for (const match of latestYml.matchAll(/^\s*(?:-\s*url|url|path):\s*(.+?)\s*$/gm)) {
    const name = match[1].trim().replace(/^['"]|['"]$/g, "");
    if (name && !name.includes("/")) referenced.add(name);
  }

  const copied = ["latest.yml"];
  for (const name of referenced) {
    for (const candidate of [name, `${name}.blockmap`]) {
      const source = path.join(distDir, candidate);
      if (await pathExists(source)) {
        await copyFileSafe(source, path.join(feedDir, candidate));
        copied.push(candidate);
      }
    }
  }
  return copied;
}

async function writeManifest(outputDirectory, buildConfig) {
  const manifest = {
    serverUrl: buildConfig.serverUrl,
    agentVersion: buildConfig.agentVersion,
    type: "electron",
    exe: "FunevDeskAgenteSetup.exe",
    msi: "FunevDeskAgente.msi",
    downloadExe: `FunevDeskAgenteSetup-${AGENT_VERSION}.exe`,
    downloadMsi: `FunevDeskAgente-${AGENT_VERSION}.msi`,
    installExe: "FunevDeskAgenteSetup.exe /S",
    installMsi: "msiexec /i FunevDeskAgente.msi /qn",
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(outputDirectory, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}

async function ensureDependencies() {
  const nodeModules = path.join(agentDesktopDir, "node_modules", "electron");
  if (await pathExists(nodeModules)) return;
  console.log("Instalando dependências do agent-desktop…");
  await runNpm(["install", "--no-audit", "--no-fund"], agentDesktopDir, 600000);
}

async function ensureIcon() {
  const iconPath = path.join(agentDesktopDir, "build", "icon.ico");
  if (await pathExists(iconPath)) return;
  const iconScript = path.join(root, "scripts", "generate-agent-icon.ps1");
  if (!(await pathExists(iconScript))) return;
  console.log("Gerando ícone do agente…");
  await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", iconScript], {
    windowsHide: true,
    timeout: 30000,
  });
}

export async function repackageElectronAgent({
  serverUrl,
  agentToken,
  outputDirectory = path.join(root, "public", "downloads", "agent"),
  branding = {},
  targets = ["nsis"],
} = {}) {
  if (process.platform !== "win32") {
    throw new Error("Repackage Electron do agente requer Windows.");
  }

  const unpacked = path.join(agentDesktopDir, "dist", "win-unpacked");
  if (!await pathExists(unpacked)) {
    throw new Error("win-unpacked não encontrado. Execute npm run build:agent primeiro.");
  }

  await ensureDependencies();

  const buildConfig = buildConfigObject(serverUrl, agentToken, branding);
  await writeBuildConfigFiles(buildConfig);

  console.log(`Reempacotando agente Electron (${targets.join(", ")}) com config e branding…`);
  await runNpx([
    "electron-builder",
    "--win",
    ...targets,
    "--prepackaged",
    "dist/win-unpacked",
  ], agentDesktopDir);

  const distDir = path.join(agentDesktopDir, "dist");
  const artifacts = await copyDistArtifacts(distDir, outputDirectory);
  await copyUpdateFeed(distDir, root);
  await writeManifest(outputDirectory, buildConfig);

  if (!artifacts.exe && !artifacts.msi) {
    throw new Error("Nenhum artefato Electron foi gerado após reempacotar.");
  }

  return artifacts;
}

export async function buildElectronAgent({
  serverUrl,
  agentToken,
  outputDirectory = path.join(root, "public", "downloads", "agent"),
  branding = {},
} = {}) {
  if (process.platform !== "win32") {
    throw new Error("Build Electron do agente requer Windows.");
  }

  await ensureDependencies();
  await ensureIcon();

  const buildConfig = buildConfigObject(serverUrl, agentToken, branding);
  await writeBuildConfigFiles(buildConfig);

  console.log("Compilando agente Electron (NSIS + MSI)…");
  await runNpm(["run", "build"], agentDesktopDir);

  const distDir = path.join(agentDesktopDir, "dist");
  const artifacts = await copyDistArtifacts(distDir, outputDirectory);
  await copyUpdateFeed(distDir, root);
  await writeManifest(outputDirectory, buildConfig);

  if (!artifacts.exe && !artifacts.msi) {
    throw new Error("Nenhum artefato Electron foi gerado em agent-desktop/dist.");
  }

  return artifacts;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const repackageOnly = args.get("repackage") === "true";
  const runner = repackageOnly ? repackageElectronAgent : buildElectronAgent;
  runner({
    serverUrl: args.get("serverUrl"),
    agentToken: args.get("agentToken"),
    outputDirectory: args.get("outputDirectory"),
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}
