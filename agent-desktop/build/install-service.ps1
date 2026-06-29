# Instala (ou remove) o Serviço de Comandos do FunevDesk: uma Tarefa Agendada que roda como
# LocalSystem e executa os comandos privilegiados (instalar software via winget, isolar rede,
# varredura). Chamado pelo instalador NSIS, que já roda elevado.
#
#   -ExePath     caminho do "FunevDesk Agente.exe" instalado
#   -ScriptPath  caminho de command-service.js (dentro do app.asar)
#   -Uninstall   remove a tarefa em vez de instalar
param(
  [string]$ExePath,
  [string]$ScriptPath,
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$taskName = "FunevDeskAgentService"
$cfgDir   = Join-Path $env:ProgramData "FunevDesk"
$wrapper  = Join-Path $cfgDir "run-command-service.cmd"
$logFile  = Join-Path $cfgDir "service-install.log"

function Log($msg) {
  try { Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] $msg" -Encoding utf8 } catch {}
}

if ($Uninstall) {
  try { schtasks /End /TN $taskName 2>$null | Out-Null } catch {}
  try { schtasks /Delete /TN $taskName /F 2>$null | Out-Null } catch {}
  try { if (Test-Path $wrapper) { Remove-Item $wrapper -Force } } catch {}
  Write-Output "Servico FunevDesk removido."
  return
}

try {
  $cmdDir  = Join-Path $cfgDir "commands"
  $pending = Join-Path $cmdDir "pending"
  $results = Join-Path $cmdDir "results"
  New-Item -ItemType Directory -Force -Path $pending, $results | Out-Null
  Log "dirs OK"

  # ACL: o agente roda na sessao do usuario e precisa escrever na fila de comandos.
  # Concede Modify a "Usuarios autenticados" (SID S-1-5-11) nas pastas; SYSTEM ja tem total.
  $acl  = Get-Acl $cmdDir
  $sid  = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-11")
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, "Modify", "ContainerInherit,ObjectInherit", "None", "Allow")
  $acl.AddAccessRule($rule)
  Set-Acl -Path $cmdDir -AclObject $acl
  Log "acl OK"

  # Wrapper .cmd: roda o exe do agente como Node puro (ELECTRON_RUN_AS_NODE, sem GUI/Chromium,
  # funciona na Sessao 0) executando o servico de comandos. Recriado de forma robusta: uma
  # instalacao elevada anterior pode te-lo deixado com dono Administradores e bloquear a regravacao.
  $stdoutLog = Join-Path $cmdDir "service-stdout.log"
  $content = "@echo off`r`nset ELECTRON_RUN_AS_NODE=1`r`n`"$ExePath`" `"$ScriptPath`" >> `"$stdoutLog`" 2>&1`r`n"
  if (Test-Path $wrapper) {
    & takeown /F $wrapper 2>&1 | Out-Null
    & icacls $wrapper /grant "*S-1-5-32-544:F" 2>&1 | Out-Null
    Remove-Item $wrapper -Force -ErrorAction SilentlyContinue
  }
  [System.IO.File]::WriteAllText($wrapper, $content)
  Log "wrapper OK"

  # (Re)cria a Tarefa Agendada como LocalSystem, no boot. Usa schtasks (CLI) por ser mais
  # previsivel que Register-ScheduledTask. Native commands reportam erro pelo exit code, nao por
  # excecao: com ErrorActionPreference=Stop + 2>&1, um stderr inofensivo (ex.: /Delete numa task
  # inexistente = "arquivo nao encontrado") viraria excecao. Trocamos para Continue e checamos rc.
  $ErrorActionPreference = "Continue"
  cmd /c "schtasks /Delete /TN `"$taskName`" /F >nul 2>&1"
  # /TR sem aspas internas: o caminho do wrapper fica em ProgramData (sem espacos), e o escaping
  # de aspas aninhadas para o schtasks via PowerShell quebrava o argumento ("...cmd\").
  $createOut = (schtasks /Create /TN $taskName /TR $wrapper /SC ONSTART /RU "SYSTEM" /RL HIGHEST /F 2>&1 | Out-String).Trim()
  $createRc  = $LASTEXITCODE
  Log "create(rc=$createRc): $createOut"
  if ($createRc -ne 0) { Write-Output "Falha ao criar a tarefa (rc=$createRc): $createOut"; exit 1 }
  $runOut = (schtasks /Run /TN $taskName 2>&1 | Out-String).Trim()
  Log "run(rc=$LASTEXITCODE): $runOut"
  Write-Output "Servico FunevDesk instalado e iniciado (LocalSystem)."
} catch {
  Log ("EXCECAO: " + $_.Exception.Message)
  Write-Output ("Falha ao instalar o servico: " + $_.Exception.Message)
  exit 1
}
