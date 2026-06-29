!macro customInit
  ; Encerra o agente em execução para o upgrade substituir app.asar e binários
  nsExec::ExecToLog 'taskkill /F /IM "FunevDesk Agente.exe" /T'
  Sleep 2000
!macroend

!macro customInstall
  ; Remove legacy PowerShell agent scheduled tasks
  nsExec::ExecToLog 'schtasks /Delete /TN "NexusDesk Telemetry" /F'
  nsExec::ExecToLog 'schtasks /Delete /TN "NexusDesk User Support" /F'
  ; Instala o Servico de Comandos (LocalSystem) para execucao privilegiada:
  ; instalar software via winget, isolar rede e varredura sem depender de o usuario ser admin.
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\install-service.ps1" -ExePath "$INSTDIR\FunevDesk Agente.exe" -ScriptPath "$INSTDIR\resources\app.asar\src\command-service.js"'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'taskkill /F /IM "FunevDesk Agente.exe" /T'
  nsExec::ExecToLog 'schtasks /End /TN "FunevDeskAgentService"'
  nsExec::ExecToLog 'schtasks /Delete /TN "FunevDeskAgentService" /F'
  nsExec::ExecToLog 'schtasks /Delete /TN "NexusDesk Telemetry" /F'
  nsExec::ExecToLog 'schtasks /Delete /TN "NexusDesk User Support" /F'
!macroend
