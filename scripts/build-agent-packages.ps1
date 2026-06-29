param(
  [string]$ServerUrl = "http://localhost:3000",
  [string]$OutputDirectory = "$PSScriptRoot\..\public\downloads\agent",
  [switch]$InstallWixIfMissing
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."
$agentDir = Join-Path $root "agent"
$stage = Join-Path $OutputDirectory "stage"
$source = Join-Path $stage "source"
New-Item -ItemType Directory -Path $source -Force | Out-Null
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $agentDir "NexusAgent.ps1") -Destination $source -Force
Copy-Item -LiteralPath (Join-Path $agentDir "NexusChat.ps1") -Destination $source -Force
Copy-Item -LiteralPath (Join-Path $agentDir "Install-GPO.ps1") -Destination $source -Force
Copy-Item -LiteralPath (Join-Path $agentDir "config.example.json") -Destination $source -Force

$localWix = Join-Path $root "tools\wix\tools"
$candle = Get-Command candle.exe -ErrorAction SilentlyContinue
$light = Get-Command light.exe -ErrorAction SilentlyContinue
if (-not $candle -and (Test-Path -LiteralPath (Join-Path $localWix "candle.exe"))) {
  $candle = Get-Item (Join-Path $localWix "candle.exe")
  $light = Get-Item (Join-Path $localWix "light.exe")
}
if ((-not $candle -or -not $light) -and $InstallWixIfMissing) {
  $wixDir = Join-Path $root "tools\wix"
  New-Item -ItemType Directory -Path $wixDir -Force | Out-Null
  $pkg = Join-Path $wixDir "wix.3.14.1.nupkg"
  if (-not (Test-Path -LiteralPath $pkg)) {
    & "$env:WINDIR\System32\curl.exe" -L --fail -o $pkg "https://www.nuget.org/api/v2/package/WiX/3.14.1"
  }
  & "$env:WINDIR\System32\tar.exe" -xf $pkg -C $wixDir
  $candle = Get-Item (Join-Path $wixDir "tools\candle.exe")
  $light = Get-Item (Join-Path $wixDir "tools\light.exe")
}
if (-not $candle -or -not $light) {
  throw "WiX nao encontrado. Rode com -InstallWixIfMissing para baixar o WiX localmente."
}

$wxs = @"
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="FunevDesk Agente" Manufacturer="FunevDesk" Version="1.0.0.0" Language="1046" UpgradeCode="D621B83B-6427-4D7B-80EA-B32D86132695">
    <Package InstallerVersion="500" Compressed="yes" InstallScope="perMachine" />
    <MajorUpgrade DowngradeErrorMessage="Uma versao mais nova do FunevDesk Agente ja esta instalada." />
    <MediaTemplate EmbedCab="yes" />
    <Property Id="SERVERURL" Value="$ServerUrl" />
    <Property Id="AGENTTOKEN" Secure="yes" />
    <Property Id="MESHNODEID" Secure="yes" />
    <Property Id="MESHINSTALLERURL" Secure="yes" />

    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="ProgramFilesFolder">
        <Directory Id="INSTALLFOLDER" Name="NexusDesk">
          <Component Id="AgentFiles" Guid="0AC06CD8-7598-4AF5-B4B6-E15003718F3C">
            <File Id="NexusAgentPs1" Source="$source\NexusAgent.ps1" />
            <File Id="NexusChatPs1" Source="$source\NexusChat.ps1" />
            <File Id="InstallGpoPs1" Source="$source\Install-GPO.ps1" KeyPath="yes" />
            <File Id="ConfigExampleJson" Source="$source\config.example.json" />
          </Component>
        </Directory>
      </Directory>
    </Directory>
    <Feature Id="MainFeature" Title="FunevDesk Agente" Level="1">
      <ComponentRef Id="AgentFiles" />
    </Feature>
    <CustomAction Id="RunInstallGpo" Directory="INSTALLFOLDER" Execute="deferred" Impersonate="no"
      ExeCommand='powershell.exe -NoProfile -ExecutionPolicy Bypass -File "[INSTALLFOLDER]Install-GPO.ps1" -ServerUrl "[SERVERURL]" -AgentToken "[AGENTTOKEN]" -MeshNodeId "[MESHNODEID]" -MeshInstallerUrl "[MESHINSTALLERURL]"' />
    <InstallExecuteSequence>
      <Custom Action="RunInstallGpo" After="InstallFiles" Condition="NOT Installed" />
    </InstallExecuteSequence>
  </Product>
</Wix>
"@
$wxsPath = Join-Path $stage "NexusDeskAgent.wxs"
Set-Content -LiteralPath $wxsPath -Encoding UTF8 -Value $wxs

$wixObj = Join-Path $stage "NexusDeskAgent.wixobj"
& $candle.FullName -nologo -out $wixObj $wxsPath
& $light.FullName -nologo -out (Join-Path $OutputDirectory "FunevDeskAgente.msi") $wixObj
if (-not (Test-Path -LiteralPath (Join-Path $OutputDirectory "FunevDeskAgente.msi"))) {
  throw "Falha ao gerar FunevDeskAgente.msi"
}

$bundleWxs = @"
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi" xmlns:bal="http://schemas.microsoft.com/wix/BalExtension">
  <Bundle Name="FunevDesk Agente" Version="1.0.0.0" Manufacturer="FunevDesk" UpgradeCode="C7A4E423-0F1D-4EF5-A1A4-01CD2E7B3636">
    <BootstrapperApplicationRef Id="WixStandardBootstrapperApplication.RtfLicense" />
    <Variable Name="SERVERURL" Type="string" Value="$ServerUrl" bal:Overridable="yes" />
    <Variable Name="AGENTTOKEN" Type="string" Value="" bal:Overridable="yes" />
    <Variable Name="MESHNODEID" Type="string" Value="" bal:Overridable="yes" />
    <Variable Name="MESHINSTALLERURL" Type="string" Value="" bal:Overridable="yes" />
    <Chain>
      <MsiPackage SourceFile="$(Join-Path $OutputDirectory "FunevDeskAgente.msi")" DisplayInternalUI="no">
        <MsiProperty Name="SERVERURL" Value="[SERVERURL]" />
        <MsiProperty Name="AGENTTOKEN" Value="[AGENTTOKEN]" />
        <MsiProperty Name="MESHNODEID" Value="[MESHNODEID]" />
        <MsiProperty Name="MESHINSTALLERURL" Value="[MESHINSTALLERURL]" />
      </MsiPackage>
    </Chain>
  </Bundle>
</Wix>
"@
$bundleWxsPath = Join-Path $stage "NexusDeskAgentBundle.wxs"
$bundleObj = Join-Path $stage "NexusDeskAgentBundle.wixobj"
Set-Content -LiteralPath $bundleWxsPath -Encoding UTF8 -Value $bundleWxs
& $candle.FullName -nologo -ext WixBalExtension -out $bundleObj $bundleWxsPath
& $light.FullName -nologo -ext WixBalExtension -out (Join-Path $OutputDirectory "FunevDeskAgenteSetup.exe") $bundleObj
if (-not (Test-Path -LiteralPath (Join-Path $OutputDirectory "FunevDeskAgenteSetup.exe"))) {
  throw "Falha ao gerar FunevDeskAgenteSetup.exe"
}

@{
  serverUrl = $ServerUrl
  exe = "FunevDeskAgenteSetup.exe"
  msi = "FunevDeskAgente.msi"
  generatedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory "manifest.json") -Encoding UTF8

Write-Host "EXE: $(Join-Path $OutputDirectory "FunevDeskAgenteSetup.exe")"
Write-Host "MSI: $(Join-Path $OutputDirectory "FunevDeskAgente.msi")"
