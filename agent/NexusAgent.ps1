param(
  [string]$ConfigPath = "$PSScriptRoot\config.json"
)

$ErrorActionPreference = "Stop"

function Get-NexusConfig {
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "Arquivo de configuração não encontrado: $ConfigPath"
  }
  return Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
}

function Save-NexusConfig($config) {
  $config | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}

function Get-SystemTelemetry {
  $os = Get-CimInstance Win32_OperatingSystem
  $cpu = Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average
  $processor = Get-CimInstance Win32_Processor | Select-Object -First 1
  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  $bios = Get-CimInstance Win32_BIOS
  $computer = Get-CimInstance Win32_ComputerSystem
  $product = Get-CimInstance Win32_ComputerSystemProduct
  $memoryUsed = (($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100
  $diskUsed = if ($disk.Size -gt 0) { (($disk.Size - $disk.FreeSpace) / $disk.Size) * 100 } else { 0 }
  $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "169.254*" -and $_.InterfaceAlias -notlike "*Loopback*" } |
    Select-Object -First 1 -ExpandProperty IPAddress
  $networkAdapters = Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
    Select-Object -First 12 |
    ForEach-Object {
      $adapter = $_
      $addresses = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "169.254*" } |
        Select-Object -ExpandProperty IPAddress
      @{
        name = $adapter.Name
        macAddress = $adapter.MacAddress
        ipv4 = @($addresses)
        status = $adapter.Status.ToString()
        speedMbps = if ($adapter.LinkSpeed -match "(\d+)\s*Gbps") { [int]$matches[1] * 1000 } elseif ($adapter.LinkSpeed -match "(\d+)\s*Mbps") { [int]$matches[1] } else { $null }
      }
    }
  $software = Get-ItemProperty `
      "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", `
      "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*" `
      -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName } |
    Sort-Object DisplayName -Unique |
    Select-Object -First 250 @{Name="name";Expression={$_.DisplayName}}, @{Name="version";Expression={$_.DisplayVersion}}, @{Name="publisher";Expression={$_.Publisher}}, @{Name="installDate";Expression={$_.InstallDate}}
  $antivirus = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction SilentlyContinue |
    ForEach-Object { @{ name = $_.displayName; state = "$($_.productState)" } }
  if (-not $antivirus) {
    try {
      $defender = Get-MpComputerStatus -ErrorAction SilentlyContinue
      if ($defender) {
        $antivirus = @(@{ name = "Windows Defender"; state = if ($defender.AntivirusEnabled) { "enabled" } else { "disabled" } })
      }
    } catch {}
  }
  $bitlocker = @()
  try {
    $bitlocker = @(Get-CimInstance -Namespace root/CIMV2/Security/MicrosoftVolumeEncryption -ClassName Win32_EncryptableVolume -ErrorAction SilentlyContinue |
      ForEach-Object { @{ drive = $_.DriveLetter; protectionStatus = $_.GetProtectionStatus().ProtectionStatus } })
  } catch {}
  $firewall = @(Get-NetFirewallProfile -ErrorAction SilentlyContinue | ForEach-Object { @{ name = $_.Name; enabled = $_.Enabled } })
  $pendingUpdates = @()
  try {
    $session = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $result = $searcher.Search("IsInstalled=0 and Type='Software'")
    $pendingUpdates = @($result.Updates | Select-Object -First 12 -ExpandProperty Title)
  } catch {}
  $localAdmins = Get-LocalGroupMember -Group "Administradores" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Name

  return @{
    hostname = $env:COMPUTERNAME
    osName = $os.Caption
    ipAddress = $ip
    loggedUser = $computer.UserName
    domain = $computer.Domain
    serialNumber = $bios.SerialNumber
    machineUuid = $product.UUID
    cpuPercent = [math]::Round($cpu.Average, 1)
    memoryPercent = [math]::Round($memoryUsed, 1)
    diskPercent = [math]::Round($diskUsed, 1)
    inventory = @{
      collectedAt = (Get-Date).ToUniversalTime().ToString("o")
      hardware = @{
        manufacturer = $computer.Manufacturer
        model = $computer.Model
        biosVersion = ($bios.SMBIOSBIOSVersion -join " ")
        processorName = $processor.Name
        cpuCores = [int]$processor.NumberOfCores
        cpuLogicalProcessors = [int]$processor.NumberOfLogicalProcessors
        memoryTotalGb = [math]::Round(($os.TotalVisibleMemorySize / 1MB), 2)
      }
      storage = @{
        diskTotalGb = if ($disk.Size -gt 0) { [math]::Round(($disk.Size / 1GB), 2) } else { 0 }
        diskFreeGb = if ($disk.FreeSpace -gt 0) { [math]::Round(($disk.FreeSpace / 1GB), 2) } else { 0 }
      }
      networkAdapters = @($networkAdapters)
      antivirus = @($antivirus)
      localAdmins = @($localAdmins)
      installedSoftware = @($software)
      security = @{
        domain = $computer.Domain
        bitlocker = @($bitlocker)
        firewall = @($firewall)
        pendingUpdates = @($pendingUpdates)
      }
    }
  }
}

$script:config = Get-NexusConfig
$headers = @{ "x-agent-token" = $script:config.agentToken }
$logPath = Join-Path $PSScriptRoot "agent.log"

while ($true) {
  try {
    $payload = Get-SystemTelemetry | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Method Post -Uri "$($script:config.serverUrl)/api/agent/heartbeat" `
      -Headers $headers -ContentType "application/json; charset=utf-8" -Body $payload

    if ($response.agentToken -and $response.agentToken -ne $script:config.agentToken) {
      $script:config.agentToken = $response.agentToken
      Save-NexusConfig $script:config
      $headers["x-agent-token"] = $script:config.agentToken
      Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Token permanente registrado."
    }
  }
  catch {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) $($_.Exception.Message)"
  }
  Start-Sleep -Seconds ([int]$script:config.heartbeatSeconds)
}
