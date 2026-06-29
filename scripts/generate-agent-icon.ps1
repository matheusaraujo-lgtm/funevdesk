Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(37, 99, 235))
$font = New-Object System.Drawing.Font("Segoe UI", 96, [System.Drawing.FontStyle]::Bold)
$g.DrawString("N", $font, [System.Drawing.Brushes]::White, 70, 60)
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$outDir = Join-Path $PSScriptRoot "..\agent-desktop\build"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$path = Join-Path $outDir "icon.ico"
$fs = [System.IO.File]::Create($path)
$icon.Save($fs)
$fs.Close()
Write-Output $path
