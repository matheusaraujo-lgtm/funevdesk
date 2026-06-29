param(
  [string]$ServerUrl = "",
  [string]$AgentToken = "",
  [string]$InstallDirectory = "$env:ProgramFiles\NexusDesk",
  [switch]$Silent
)

$ErrorActionPreference = "Stop"
$logFile = Join-Path $env:TEMP "FunevDesk-Install.log"

function Write-InstallLog([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

function Show-InstallMessage([string]$Message, [string]$Title = "FunevDesk Agente", [switch]$IsError) {
  if ($Silent) {
    Write-InstallLog "$Title — $Message"
    return
  }
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    $icon = if ($IsError) { [System.Windows.Forms.MessageBoxIcon]::Error } else { [System.Windows.Forms.MessageBoxIcon]::Information }
    [System.Windows.Forms.MessageBox]::Show($Message, $Title, [System.Windows.Forms.MessageBoxButtons]::OK, $icon) | Out-Null
  } catch {
    Write-Host "$Title — $Message"
  }
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not $Silent -and ($args -join " ") -match '(?i)(/quiet|/silent|/S\b|-Silent)') {
  $Silent = $true
}

try {
  Write-InstallLog "Iniciando instalacao..."

  if (-not (Test-IsAdministrator)) {
    Write-InstallLog "Requer elevacao — solicitando UAC"
    $elevatedArgs = @(
      "-NoProfile", "-ExecutionPolicy", "Bypass",
      "-File", "`"$PSCommandPath`""
    )
    if ($Silent) { $elevatedArgs += "-Silent" }
    if ($ServerUrl) { $elevatedArgs += "-ServerUrl", $ServerUrl }
    if ($AgentToken) { $elevatedArgs += "-AgentToken", $AgentToken }
    if ($MeshNodeId) { $elevatedArgs += "-MeshNodeId", $MeshNodeId }
    if ($MeshInstallerUrl) { $elevatedArgs += "-MeshInstallerUrl", $MeshInstallerUrl }
    if ($InstallDirectory) { $elevatedArgs += "-InstallDirectory", $InstallDirectory }

    $proc = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList ($elevatedArgs -join " ") -PassThru -Wait
    if (-not $proc) {
      Show-InstallMessage "Instalacao cancelada — permissao de administrador necessaria." -IsError
      exit 1
    }
    exit $proc.ExitCode
  }

  $source = Split-Path -Parent $MyInvocation.MyCommand.Path
  if ([string]::IsNullOrWhiteSpace($source)) {
    $source = Get-Location | Select-Object -ExpandProperty Path
  }

  Write-InstallLog "Origem: $source"

  $configPath = Join-Path $source "config.json"
  if ((Test-Path $configPath) -and ([string]::IsNullOrWhiteSpace($ServerUrl) -or [string]::IsNullOrWhiteSpace($AgentToken))) {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace($ServerUrl)) { $ServerUrl = [string]$config.serverUrl }
    if ([string]::IsNullOrWhiteSpace($AgentToken)) { $AgentToken = [string]$config.agentToken }
  }

  if ([string]::IsNullOrWhiteSpace($ServerUrl) -or [string]::IsNullOrWhiteSpace($AgentToken)) {
    throw "ServerUrl e AgentToken sao obrigatorios (config.json ausente ou invalido)."
  }

  foreach ($required in @("NexusAgent.ps1", "NexusChat.ps1")) {
    if (-not (Test-Path (Join-Path $source $required))) {
      throw "Arquivo $required nao encontrado em $source"
    }
  }

  New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null
  foreach ($file in @("NexusAgent.ps1", "NexusChat.ps1", "Install-GPO.ps1")) {
    $from = [System.IO.Path]::GetFullPath((Join-Path $source $file))
    $to = [System.IO.Path]::GetFullPath((Join-Path $InstallDirectory $file))
    if ($from -ne $to -and (Test-Path -LiteralPath $from)) {
      Copy-Item -LiteralPath $from -Destination $to -Force
    }
  }

  @{
    serverUrl = $ServerUrl.TrimEnd("/")
    agentToken = $AgentToken
    heartbeatSeconds = 60
    chatPollSeconds = 5
  } | ConvertTo-Json | Set-Content -LiteralPath "$InstallDirectory\config.json" -Encoding UTF8

  Write-InstallLog "Arquivos copiados para $InstallDirectory"

  $telemetryAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstallDirectory\NexusAgent.ps1`""
  $startupTrigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName "NexusDesk Telemetry" -Action $telemetryAction `
    -Trigger $startupTrigger -Principal $principal -Force | Out-Null

  $chatAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$InstallDirectory\NexusChat.ps1`""
  $logonTrigger = New-ScheduledTaskTrigger -AtLogOn
  Register-ScheduledTask -TaskName "NexusDesk User Support" -Action $chatAction `
    -Trigger $logonTrigger -Force | Out-Null

  Start-ScheduledTask -TaskName "NexusDesk Telemetry" -ErrorAction SilentlyContinue

  Write-InstallLog "Instalacao concluida com sucesso"
  Show-InstallMessage "Agente instalado em:`n$InstallDirectory`n`nTarefas criadas:`n- NexusDesk Telemetry`n- NexusDesk User Support`n`nLog: $logFile"
  Write-Output "FunevDesk instalado em $InstallDirectory"
  exit 0
}
catch {
  Write-InstallLog "ERRO: $($_.Exception.Message)"
  Show-InstallMessage "Falha na instalacao:`n$($_.Exception.Message)`n`nLog completo:`n$logFile" "FunevDesk Agente" -IsError
  exit 1
}
