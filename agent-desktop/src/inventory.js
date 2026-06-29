const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const si = require("systeminformation");
const { appendLog } = require("./config");

const execFileAsync = promisify(execFile);

async function getLocalAdmins() {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Get-LocalGroupMember -Group 'Administradores' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name",
    ], { windowsHide: true, timeout: 15000 });
    return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// Decodifica o productState do SecurityCenter2 (Windows) em estado legível.
// O número (hex de 6 dígitos) traz: bytes 2-3 = proteção em tempo real (0x10/0x11
// = ligada), bytes 4-5 = assinaturas (0x00 = atualizadas).
async function getAntivirus() {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        "$items = @(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -EA 0 | ForEach-Object { $h = '{0:x6}' -f [int]$_.productState; @{ name=$_.displayName; state=\"$($_.productState)\"; enabled=($h.Substring(2,2) -in @('10','11')); upToDate=($h.Substring(4,2) -eq '00') } }); if (-not $items.Count) { $d = Get-MpComputerStatus -EA 0; if ($d) { $items = @(@{ name='Windows Defender'; enabled=[bool]$d.RealTimeProtectionEnabled; upToDate=([int]$d.AntivirusSignatureAge -le 7) }) } }; $items | ConvertTo-Json -Compress",
      ], { windowsHide: true, timeout: 12000 });
      const parsed = JSON.parse(stdout || "[]");
      const list = Array.isArray(parsed) ? parsed : (parsed?.name ? [parsed] : []);
      if (list.length) return list;
    } catch {
      // fallback abaixo
    }
  }
  try {
    const security = await si.security();
    if (Array.isArray(security)) {
      return security.map((item) => ({
        name: item.name || item.displayName || "Antivirus",
        enabled: Boolean(item.enabled),
      }));
    }
  } catch {
    // ignore
  }
  return [];
}

// EPP/Defender: estado da proteção + ameaças detectadas (reais, via Defender).
// Usado para alimentar a Central de Segurança do servidor com detecções reais.
async function getEppStatus() {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "$s = Get-MpComputerStatus -EA 0; if (-not $s) { '{}' | Write-Output; return }; " +
        "@{ product='Microsoft Defender'; realtimeProtection=[bool]$s.RealTimeProtectionEnabled; " +
        "antivirusEnabled=[bool]$s.AntivirusEnabled; antispywareEnabled=[bool]$s.AntispywareEnabled; " +
        "tamperProtection=[bool]$s.IsTamperProtected; signatureAgeDays=[int]$s.AntivirusSignatureAge; " +
        "signatureVersion=\"$($s.AntivirusSignatureVersion)\"; lastFullScan=\"$($s.FullScanEndTime)\"; " +
        "lastQuickScan=\"$($s.QuickScanEndTime)\" } | ConvertTo-Json -Compress",
    ], { windowsHide: true, timeout: 12000 });
    const parsed = JSON.parse(stdout || "{}");
    return parsed?.product ? parsed : null;
  } catch {
    return null;
  }
}

// Ameaças detectadas pelo Defender (histórico recente). Cada item vira candidato
// a alerta de segurança no servidor.
async function getDefenderThreats() {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "$sev = @{0='Desconhecida';1='Baixa';2='Moderada';4='Alta';5='Grave'}; " +
        "$act = @{0='Desconhecida';1='Limpa';2='Quarentena';3='Removida';4='Permitida';5='Em espera';6='Bloqueada';8='Sem ação';9='Aguardando reinício'}; " +
        "$names = @{}; $sevs = @{}; Get-MpThreat -EA 0 | ForEach-Object { $names[[string]$_.ThreatID] = $_.ThreatName; $sevs[[string]$_.ThreatID] = [int]$_.SeverityID }; " +
        "@(Get-MpThreatDetection -EA 0 | Sort-Object InitialDetectionTime -Descending | Select-Object -First 50 | ForEach-Object { " +
        "$tid = [string]$_.ThreatID; " +
        "@{ id=\"$($_.DetectionID)\"; threatId=$tid; name=$names[$tid]; " +
        "severity=$sev[[int]$sevs[$tid]]; action=$act[[int]$_.CleaningActionID]; " +
        "statusId=[int]$_.ThreatStatusID; detectedAt=\"$($_.InitialDetectionTime)\"; " +
        "resources=@($_.Resources) -join '; '; processName=\"$($_.ProcessName)\" } }) | ConvertTo-Json -Compress",
    ], { windowsHide: true, timeout: 15000 });
    const parsed = JSON.parse(stdout || "[]");
    const list = Array.isArray(parsed) ? parsed : (parsed?.name ? [parsed] : []);
    return list.filter((item) => item?.name);
  } catch {
    return [];
  }
}

async function getWindowsSecurity() {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "$computer = Get-CimInstance Win32_ComputerSystem -EA 0; $bitlocker = @(); try { $bitlocker = @(Get-CimInstance -Namespace root/CIMV2/Security/MicrosoftVolumeEncryption -ClassName Win32_EncryptableVolume -EA 0 | ForEach-Object { @{ drive=$_.DriveLetter; protectionStatus=$_.GetProtectionStatus().ProtectionStatus } }) } catch {}; $firewall = @(Get-NetFirewallProfile -EA 0 | ForEach-Object { @{ name=$_.Name; enabled=$_.Enabled } }); @{ domain=$computer.Domain; bitlocker=$bitlocker; firewall=$firewall; pendingUpdates=@() } | ConvertTo-Json -Compress",
    ], { windowsHide: true, timeout: 20000 });
    return JSON.parse(stdout || "{}");
  } catch {
    return null;
  }
}

function normalizeFirewallProfiles(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => ({
    name: entry?.name || "",
    enabled: typeof entry?.enabled === "boolean"
      ? entry.enabled
      : /^(true|1|yes|on)$/i.test(String(entry?.enabled ?? "").trim()),
  }));
}

// Formata a data de instalação do registro (YYYYMMDD) para DD/MM/AAAA.
function formatInstallDate(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

async function getInstalledSoftware() {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `$keys = @('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); $seen = @{}; Get-ItemProperty -EA SilentlyContinue $keys | Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $seen[$_.DisplayName] } | ForEach-Object { $seen[$_.DisplayName] = $true; @{ name=$_.DisplayName; version=$_.DisplayVersion; publisher=$_.Publisher; installDate=$_.InstallDate; sizeKb=$_.EstimatedSize; location=$_.InstallLocation; displayIcon=$_.DisplayIcon } } | ConvertTo-Json -Compress`,
      ], { windowsHide: true, timeout: 20000 });
      const parsed = JSON.parse(stdout || "[]");
      const items = Array.isArray(parsed) ? parsed : (parsed?.name ? [parsed] : []);
      return items
        .map((item) => ({
          name: item.name,
          version: item.version || "",
          publisher: item.publisher || "",
          installDate: formatInstallDate(item.installDate),
          sizeMb: Number.isFinite(Number(item.sizeKb)) && Number(item.sizeKb) > 0
            ? Math.round((Number(item.sizeKb) / 1024) * 10) / 10
            : null,
          location: item.location || "",
          displayIcon: item.displayIcon || "",
        }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .slice(0, 250);
    } catch {
      // PowerShell fallback failed, trying systeminformation
    }

    try {
      const apps = await Promise.race([
        si.software(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 25000)),
      ]);
      return apps
        .filter((app) => app.name)
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 250)
        .map((app) => ({
          name: app.name,
          version: app.version || "",
          publisher: app.publisher || "",
          installDate: app.installDate || "",
        }));
    } catch {
      return [];
    }
  }

  try {
    const apps = await si.software();
    return apps
      .filter((app) => app.name)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 250)
      .map((app) => ({
        name: app.name,
        version: app.version || "",
        publisher: app.publisher || "",
        installDate: app.installDate || "",
      }));
  } catch {
    return [];
  }
}

// Extrai o ícone real de cada app (base64 PNG) a partir do DisplayIcon do
// registro. Best-effort: roda em passo isolado com timeout próprio; se falhar
// ou estourar o tempo, o software ainda aparece (sem ícone). Os caminhos vão
// por arquivo temporário para evitar problemas de aspas/limite de argumento.
async function attachSoftwareIcons(items) {
  if (process.platform !== "win32" || !Array.isArray(items) || !items.length) return items;
  const targets = items
    .map((item, index) => ({ index, icon: item.displayIcon }))
    .filter((entry) => entry.icon)
    .slice(0, 140);
  if (!targets.length) return items;

  const tmpFile = path.join(os.tmpdir(), `fd-icons-${process.pid}-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(targets), "utf8");
    const script =
      "Add-Type -AssemblyName System.Drawing; " +
      `$list = Get-Content -Raw '${tmpFile}' | ConvertFrom-Json; $out = @{}; ` +
      "foreach ($e in $list) { try { $p = ($e.icon -replace '\"','').Trim(); " +
      "if ($p -match '^(.*?),\\s*-?\\d+$') { $p = $matches[1] }; " +
      "if (-not (Test-Path -LiteralPath $p)) { continue }; " +
      "$ext = [IO.Path]::GetExtension($p).ToLower(); " +
      "if ($ext -eq '.ico') { $ico = New-Object System.Drawing.Icon($p) } else { $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($p) }; " +
      "if (-not $ico) { continue }; $bmp = $ico.ToBitmap(); $ms = New-Object IO.MemoryStream; " +
      "$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); " +
      "$out[[string]$e.index] = [Convert]::ToBase64String($ms.ToArray()); " +
      "$ms.Dispose(); $bmp.Dispose(); $ico.Dispose() } catch {} }; " +
      "$out | ConvertTo-Json -Compress";
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      windowsHide: true,
      timeout: 18000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const map = JSON.parse(stdout || "{}");
    for (const [index, b64] of Object.entries(map)) {
      const target = items[Number(index)];
      if (target && b64) target.icon = `data:image/png;base64,${b64}`;
    }
  } catch (error) {
    appendLog(`Ícones de software: ${error.message}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
  return items;
}

function pickPrimaryIpv4(interfaces) {
  for (const iface of interfaces) {
    if (iface.internal || !iface.ip4) continue;
    if (iface.ip4.startsWith("169.254.")) continue;
    return iface.ip4;
  }
  return null;
}

async function collectTelemetry() {
  const [cpuLoad, mem, fsSize, osInfo, system, bios, uuid, networkInterfaces] = await Promise.all([
    si.currentLoad().catch(() => ({ currentLoad: 0 })),
    si.mem().catch(() => ({ total: 0, available: 0 })),
    si.fsSize().catch(() => []),
    si.osInfo().catch(() => ({})),
    si.system().catch(() => ({})),
    si.bios().catch(() => ({})),
    si.uuid().catch(() => ({})),
    si.networkInterfaces().catch(() => []),
  ]);

  const cDrive = fsSize.find((entry) => entry.mount === "C:" || entry.mount === "C:\\") || fsSize[0];
  const diskUsedPercent = cDrive?.size > 0
    ? Math.round(((cDrive.size - cDrive.available) / cDrive.size) * 1000) / 10
    : 0;
  const memoryUsedPercent = mem.total > 0
    ? Math.round(((mem.total - mem.available) / mem.total) * 1000) / 10
    : 0;

  const loggedUser = os.userInfo().username;
  const domain = process.env.USERDOMAIN || system.model || "";

  return {
    hostname: os.hostname(),
    osName: `${osInfo.distro || osInfo.platform} ${osInfo.release || ""}`.trim(),
    ipAddress: pickPrimaryIpv4(networkInterfaces) || "",
    loggedUser: domain ? `${domain}\\${loggedUser}` : loggedUser,
    domain,
    serialNumber: system.serial || bios.serial || "",
    machineUuid: uuid.hardware || uuid.os || "",
    cpuPercent: Math.min(100, Math.max(0, Math.round((cpuLoad.currentLoad || 0) * 10) / 10)) || 0,
    memoryPercent: Math.min(100, Math.max(0, memoryUsedPercent)) || 0,
    diskPercent: Math.min(100, Math.max(0, diskUsedPercent)) || 0,
  };
}

async function collectInventoryFull() {
  const telemetry = await collectTelemetry();
  const [cpu, mem, fsSize, osInfo, system, bios, uuid, networkInterfaces] = await Promise.all([
    si.cpu().catch(() => ({})),
    si.mem().catch(() => ({ total: 0 })),
    si.fsSize().catch(() => []),
    si.osInfo().catch(() => ({})),
    si.system().catch(() => ({})),
    si.bios().catch(() => ({})),
    si.uuid().catch(() => ({})),
    si.networkInterfaces().catch(() => []),
  ]);

  const cDrive = fsSize.find((entry) => entry.mount === "C:" || entry.mount === "C:\\") || fsSize[0];
  const diskTotalGb = cDrive ? Math.round((cDrive.size / 1024 ** 3) * 100) / 100 : 0;
  const diskFreeGb = cDrive ? Math.round((cDrive.available / 1024 ** 3) * 100) / 100 : 0;

  const physicalAdapters = networkInterfaces
    .filter((iface) => !iface.internal && iface.type !== "virtual")
    .slice(0, 12)
    .map((iface) => ({
      name: iface.ifaceName || iface.iface,
      macAddress: iface.mac || "",
      ipv4: iface.ip4 ? [iface.ip4] : [],
      status: iface.operstate || "unknown",
      speedMbps: iface.speed ? Math.round(iface.speed / 1000) : undefined,
    }));

  const [antivirus, localAdmins, installedSoftware, security, eppStatus, defenderThreats] = await Promise.all([
    getAntivirus(),
    getLocalAdmins(),
    getInstalledSoftware(),
    getWindowsSecurity(),
    getEppStatus(),
    getDefenderThreats(),
  ]);

  // Ícones reais dos apps (passo isolado, best-effort). Remove o caminho bruto.
  await attachSoftwareIcons(installedSoftware);
  for (const item of installedSoftware) delete item.displayIcon;

  // EPP consolidado: estado da proteção + ameaças reais detectadas.
  const epp = eppStatus
    ? { ...eppStatus, threats: defenderThreats }
    : (defenderThreats.length ? { product: "Microsoft Defender", threats: defenderThreats } : undefined);

  return {
    telemetry,
    inventory: {
      collectedAt: new Date().toISOString(),
      hardware: {
        manufacturer: system.manufacturer || "",
        model: system.model || "",
        biosVersion: bios.version || "",
        processorName: cpu.brand || "",
        cpuCores: cpu.physicalCores || cpu.cores || 0,
        cpuLogicalProcessors: cpu.cores || 0,
        memoryTotalGb: mem.total > 0 ? Math.round((mem.total / 1024 ** 3) * 100) / 100 : 0,
      },
      storage: {
        diskTotalGb,
        diskFreeGb,
      },
      networkAdapters: physicalAdapters,
      antivirus,
      localAdmins,
      installedSoftware,
      epp,
      security: security
        ? {
            ...security,
            firewall: normalizeFirewallProfiles(security.firewall),
          }
        : undefined,
    },
  };
}

async function collectInventory() {
  try {
    const result = await Promise.race([
      collectInventoryFull(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout: inventário excedeu 45s")), 45000)),
    ]);
    return result;
  } catch (error) {
    appendLog(`Inventário: ${error.message}`);
    try {
      const telemetry = await collectTelemetry();
      return { telemetry, inventory: null, inventoryError: error.message };
    } catch {
      return { telemetry: {}, inventory: null, inventoryError: error.message };
    }
  }
}

module.exports = { collectInventory, collectTelemetry };
