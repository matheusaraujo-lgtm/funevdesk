param(
  [string]$InstallerPath = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $InstallerPath) {
  $InstallerPath = Join-Path $root "public\downloads\agent\FunevDeskAgenteSetup.exe"
}

if (-not (Test-Path -LiteralPath $InstallerPath)) {
  Write-Error "Instalador nao encontrado: $InstallerPath. Execute npm run build:agent primeiro."
}

Write-Host "Encerrando agente em execucao..."
cmd /c "taskkill /F /IM \"FunevDesk Agente.exe\" /T >nul 2>nul"
Start-Sleep -Seconds 2

$uninstallCandidates = @(
  Join-Path ${env:ProgramFiles} "FunevDesk Agente\Uninstall FunevDesk Agente.exe"
  Join-Path ${env:LOCALAPPDATA} "Programs\FunevDesk Agente\Uninstall FunevDesk Agente.exe"
)

foreach ($uninstaller in $uninstallCandidates) {
  if (Test-Path -LiteralPath $uninstaller) {
    Write-Host "Removendo instalacao anterior: $uninstaller"
    $uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S" -PassThru -Wait -ErrorAction SilentlyContinue
    if ($uninstall.ExitCode -eq 1223) {
      Write-Warning "UAC cancelado na desinstalacao ($uninstaller) - tentando instalar versao nova em perfil do usuario."
    } elseif ($uninstall.ExitCode -ne 0) {
      Write-Warning "Desinstalacao retornou $($uninstall.ExitCode) - continuando com nova instalacao."
    }
    Start-Sleep -Seconds 2
  }
}

Write-Host "Instalando $InstallerPath ..."
$proc = Start-Process -FilePath $InstallerPath -ArgumentList "/S" -PassThru -Wait
if ($proc.ExitCode -eq 1223) {
  Write-Error "Instalacao cancelada (UAC). Clique duas vezes em FunevDeskAgenteSetup.exe e confirme o instalador."
}
if ($proc.ExitCode -ne 0) {
  Write-Error "Instalador retornou codigo $($proc.ExitCode)."
}

$localExe = Join-Path ${env:LOCALAPPDATA} "Programs\FunevDesk Agente\FunevDesk Agente.exe"
$programExe = Join-Path ${env:ProgramFiles} "FunevDesk Agente\FunevDesk Agente.exe"
$installed = if (Test-Path -LiteralPath $localExe) { $localExe } elseif (Test-Path -LiteralPath $programExe) { $programExe } else { $null }

if (-not $installed) {
  Write-Error "Instalacao nao encontrada apos o setup."
}

Write-Host "Instalado em: $installed"
Start-Process -FilePath $installed
Write-Host "Agente atualizado e iniciado."
