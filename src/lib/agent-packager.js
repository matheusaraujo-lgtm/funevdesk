import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getEmbeddedStubExe } from "@/lib/agent-stub-binary";
import { createStoreZip } from "./zip-store";

const execFileAsync = promisify(execFile);

const MARKER = Buffer.from("NXDSZIP");
const PRODUCT_VERSION = "1.0.0.0";
const WIX_ZIP_URL = "https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip";
const IEXPRESS_TIMEOUT_MS = 45000;

export function buildAgentPayloadFiles(files, serverUrl, token) {
  const installDir = serverUrl.replace(/\/$/, "");
  const config = JSON.stringify({
    serverUrl: installDir,
    agentToken: token,
    heartbeatSeconds: 60,
    chatPollSeconds: 5,
  }, null, 2);

  return [
    { name: "NexusAgent.ps1", content: files.agent },
    { name: "NexusChat.ps1", content: files.chat },
    { name: "Install-GPO.ps1", content: files.install },
    { name: "config.json", content: config },
  ];
}

function installBatContent() {
  return [
    "@echo off",
    "cd /d \"%~dp0\"",
    "echo Instalando FunevDesk Agente...",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"\"%~dp0Install-GPO.ps1\"\"' -Wait\"",
    "if errorlevel 1 (",
    "  echo Falha na instalacao. Veja %TEMP%\\FunevDesk-Install.log",
    "  pause",
    "  exit /b 1",
    ")",
    "echo Instalacao concluida.",
    "pause",
    "",
  ].join("\r\n");
}

export function buildInstallerZip(payloadFiles, extraFiles = []) {
  return createStoreZip([
    ...payloadFiles,
    { name: "INSTALAR.bat", content: installBatContent() },
    ...extraFiles,
  ]);
}

export function buildPayloadZip(payloadFiles) {
  return buildInstallerZip(payloadFiles);
}

async function writePayloadDir(payloadDir, payloadFiles) {
  await fs.mkdir(payloadDir, { recursive: true });
  for (const file of payloadFiles) {
    await fs.writeFile(path.join(payloadDir, file.name), file.content, "utf8");
  }
  await fs.writeFile(path.join(payloadDir, "install.cmd"), [
    "@echo off",
    "cd /d \"%~dp0\"",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0Install-GPO.ps1\" %*",
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n"), "utf8");
}

function buildSedFile({ payloadDir, targetExe, fileNames }) {
  const sourceDir = `${payloadDir}\\`;
  const fileLines = fileNames.map((_, index) => `%FILE${index}%=`).join("\r\n");
  const stringLines = fileNames.map((name, index) => `FILE${index}=${name}`).join("\r\n");

  return `[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles

[SourceFiles]
SourceFiles0=${sourceDir}

[SourceFiles0]
${fileLines}

[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=Instalacao concluida.
TargetName=${targetExe}
FriendlyName=FunevDesk Agente
AppLaunched=cmd.exe /c install.cmd
PostInstallCmd=
AdminQuietInstCmd=cmd.exe /c install.cmd /quiet
UserQuietInstCmd=
${stringLines}
`;
}

async function buildIExpressExe(payloadFiles, outputFilename) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "nexusdesk-exe-"));
  try {
    const payloadDir = path.join(tempDir, "payload");
    await writePayloadDir(payloadDir, payloadFiles);

    const fileNames = [...payloadFiles.map((file) => file.name), "install.cmd"];
    const targetExe = path.join(tempDir, outputFilename);
    const sedFile = path.join(tempDir, "package.sed");
    await fs.writeFile(sedFile, buildSedFile({ payloadDir, targetExe, fileNames }), "utf8");

    const iexpress = path.join(process.env.WINDIR || "C:\\Windows", "System32", "iexpress.exe");
    await fs.access(iexpress);
    await execFileAsync(iexpress, ["/N", "/Q", sedFile], {
      windowsHide: true,
      timeout: IEXPRESS_TIMEOUT_MS,
    });

    const exe = await fs.readFile(targetExe);
    if (exe.length < 64 || exe[0] !== 0x4d || exe[1] !== 0x5a) {
      throw new Error("O IExpress não gerou um executável válido.");
    }
    return exe;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildStubZipExe(payloadFiles) {
  const stub = getEmbeddedStubExe();
  const zip = buildInstallerZip(payloadFiles);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(zip.length, 0);
  const exe = Buffer.concat([stub, MARKER, length, zip]);
  if (exe[0] !== 0x4d || exe[1] !== 0x5a) {
    throw new Error("Executável base inválido.");
  }
  return exe;
}

export async function buildLegacySelfExtractingExe(payloadFiles) {
  if (process.platform === "win32") {
    try {
      return await buildIExpressExe(payloadFiles, "FunevDeskAgenteSetup.exe");
    } catch {
      try {
        return buildStubZipExe(payloadFiles);
      } catch {
        return null;
      }
    }
  }
  try {
    return buildStubZipExe(payloadFiles);
  } catch {
    return null;
  }
}

async function findInstalledWix() {
  const candidates = [
    path.join(process.env["ProgramFiles(x86)"] || "", "WiX Toolset v3.14", "bin", "candle.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "WiX Toolset v3.11", "bin", "candle.exe"),
    path.join(process.env.ProgramFiles || "", "WiX Toolset v3.14", "bin", "candle.exe"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return {
        candle: candidate,
        light: candidate.replace(/candle\.exe$/i, "light.exe"),
      };
    } catch {
      // try next
    }
  }
  return null;
}

async function ensurePortableWix() {
  const projectToolsDir = path.join(process.cwd(), "tools", "wix", "tools");
  const projectCandle = path.join(projectToolsDir, "candle.exe");
  const projectLight = path.join(projectToolsDir, "light.exe");
  try {
    await fs.access(projectCandle);
    await fs.access(projectLight);
    return { candle: projectCandle, light: projectLight };
  } catch {
    // continue
  }

  const toolsDir = path.join(process.cwd(), "agent", "wix", "tools");
  const candle = path.join(toolsDir, "candle.exe");
  const light = path.join(toolsDir, "light.exe");

  try {
    await fs.access(candle);
    await fs.access(light);
    return { candle, light };
  } catch {
    // continue
  }

  const installed = await findInstalledWix();
  if (installed) return installed;

  await fs.mkdir(toolsDir, { recursive: true });
  const zipPath = path.join(toolsDir, "wix314-binaries.zip");
  const downloadScript = [
    "$ProgressPreference = 'SilentlyContinue'",
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12",
    `Invoke-WebRequest -Uri '${WIX_ZIP_URL}' -OutFile '${zipPath.replace(/'/g, "''")}' -UseBasicParsing`,
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${toolsDir.replace(/'/g, "''")}' -Force`,
    `Remove-Item -LiteralPath '${zipPath.replace(/'/g, "''")}' -Force`,
  ].join("; ");

  await execFileAsync("powershell.exe", ["-NoProfile", "-Command", downloadScript], {
    windowsHide: true,
    timeout: 120000,
  });

  await fs.access(candle);
  await fs.access(light);
  return { candle, light };
}

export async function buildLegacyMsiInstaller(payloadFiles) {
  if (process.platform !== "win32") {
    throw new Error("MSI so pode ser gerado em servidor Windows.");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "nexusdesk-msi-"));
  try {
    for (const file of payloadFiles) {
      await fs.writeFile(path.join(tempDir, file.name), file.content, "utf8");
    }

    const template = await fs.readFile(path.join(process.cwd(), "agent", "wix", "Product.wxs"), "utf8");
    const wxs = template.replaceAll("{{PRODUCT_VERSION}}", PRODUCT_VERSION);
    const wxsPath = path.join(tempDir, "Product.wxs");
    const msiPath = path.join(tempDir, "FunevDeskAgente.msi");
    await fs.writeFile(wxsPath, wxs, "utf8");

    const { candle, light } = await ensurePortableWix();
    const wixObj = path.join(tempDir, "Product.wixobj");
    await execFileAsync(candle, ["-nologo", "-out", wixObj, wxsPath], {
      cwd: tempDir,
      windowsHide: true,
      timeout: 60000,
    });
    await execFileAsync(light, ["-nologo", "-spdb", "-out", msiPath, wixObj], {
      cwd: tempDir,
      windowsHide: true,
      timeout: 60000,
    });

    return await fs.readFile(msiPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function buildLegacyBurnExeInstaller(payloadFiles) {
  if (process.platform !== "win32") {
    throw new Error("EXE so pode ser gerado em servidor Windows.");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "nexusdesk-burn-"));
  try {
    for (const file of payloadFiles) {
      await fs.writeFile(path.join(tempDir, file.name), file.content, "utf8");
    }

    const template = await fs.readFile(path.join(process.cwd(), "agent", "wix", "Product.wxs"), "utf8");
    const wxs = template.replaceAll("{{PRODUCT_VERSION}}", PRODUCT_VERSION);
    const productWxsPath = path.join(tempDir, "Product.wxs");
    const productObjPath = path.join(tempDir, "Product.wixobj");
    const msiPath = path.join(tempDir, "FunevDeskAgente.msi");
    await fs.writeFile(productWxsPath, wxs, "utf8");

    const licensePath = path.join(tempDir, "license.rtf");
    await fs.writeFile(licensePath, "{\\rtf1\\ansi FunevDesk Agente\\line Instalador corporativo interno.}", "utf8");

    const bundleWxsPath = path.join(tempDir, "Bundle.wxs");
    const bundleObjPath = path.join(tempDir, "Bundle.wixobj");
    const exePath = path.join(tempDir, "FunevDeskAgenteSetup.exe");
    const bundleWxs = `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi" xmlns:bal="http://schemas.microsoft.com/wix/BalExtension">
  <Bundle Name="FunevDesk Agente" Version="${PRODUCT_VERSION}" Manufacturer="FunevDesk" UpgradeCode="C7A4E423-0F1D-4EF5-A1A4-01CD2E7B3636">
    <BootstrapperApplicationRef Id="WixStandardBootstrapperApplication.RtfLicense">
      <bal:WixStandardBootstrapperApplication LicenseFile="${licensePath}" />
    </BootstrapperApplicationRef>
    <Chain>
      <MsiPackage SourceFile="${msiPath}" DisplayInternalUI="no" />
    </Chain>
  </Bundle>
</Wix>`;
    await fs.writeFile(bundleWxsPath, bundleWxs, "utf8");

    const { candle, light } = await ensurePortableWix();
    await execFileAsync(candle, ["-nologo", "-out", productObjPath, productWxsPath], {
      cwd: tempDir,
      windowsHide: true,
      timeout: 60000,
    });
    await execFileAsync(light, ["-nologo", "-spdb", "-out", msiPath, productObjPath], {
      cwd: tempDir,
      windowsHide: true,
      timeout: 60000,
    });
    await execFileAsync(candle, ["-nologo", "-ext", "WixBalExtension", "-out", bundleObjPath, bundleWxsPath], {
      cwd: tempDir,
      windowsHide: true,
      timeout: 60000,
    });
    await execFileAsync(light, ["-nologo", "-ext", "WixBalExtension", "-out", exePath, bundleObjPath], {
      cwd: tempDir,
      windowsHide: true,
      timeout: 60000,
    });

    return await fs.readFile(exePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
