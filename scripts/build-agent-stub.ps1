$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stubDir = Join-Path $root "agent\stub"
$source = Join-Path $stubDir "InstallerStub.cs"
$output = Join-Path $stubDir "FunevDeskSetupStub.exe"

if (Test-Path $output) {
  Write-Host "Stub já existe: $output"
  exit 0
}

$code = Get-Content -LiteralPath $source -Raw
Add-Type -TypeDefinition $code -OutputAssembly $output -ReferencedAssemblies System.IO.Compression.FileSystem,System.Windows.Forms
Write-Host "Stub gerado: $output"
