# Runs elevated from the Avi Music installer. Installs the signed package, trusts its certificate,
# makes a desktop shortcut and launches the app. Everything is logged to %TEMP%\AviMusicInstall.log
$ErrorActionPreference = 'Stop'
$log = Join-Path $env:TEMP 'AviMusicInstall.log'
Start-Transcript -Path $log -Force | Out-Null
Add-Type -AssemblyName System.Windows.Forms
function Say($t, $icon) { [void][System.Windows.Forms.MessageBox]::Show($t, 'Avi Music', 'OK', $icon) }
try {
  $here = $PSScriptRoot
  $cfg = Get-Content (Join-Path $here 'config.json') -Raw | ConvertFrom-Json
  Write-Host "Installing $($cfg.name) ($($cfg.msix))"
  $cer = Join-Path $here 'AviMusic.cer'
  Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
  Write-Host 'Certificate trusted'
  $deps = @(Get-ChildItem (Join-Path $here 'deps') -Filter *.appx -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  $msix = Join-Path $here $cfg.msix
  if ($deps.Count -gt 0) { Add-AppxPackage -Path $msix -DependencyPath $deps -ForceUpdateFromAnyVersion }
  else { Add-AppxPackage -Path $msix -ForceUpdateFromAnyVersion }
  $pkg = Get-AppxPackage -Name $cfg.name
  if (-not $pkg) { throw 'Package did not register after install.' }
  $aumid = "shell:AppsFolder\$($pkg.PackageFamilyName)!$($cfg.appId)"
  Write-Host "Installed: $($pkg.PackageFullName)  $aumid"
  $desk = [Environment]::GetFolderPath('CommonDesktopDirectory')
  $sh = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desk 'Avi Music.lnk'))
  $sh.TargetPath = 'explorer.exe'
  $sh.Arguments = $aumid
  $sh.Save()
  Start-Process explorer.exe $aumid
  Stop-Transcript | Out-Null
  exit 0
} catch {
  Write-Host "ERROR: $($_.Exception.Message)"
  Stop-Transcript | Out-Null
  Say ("Avi Music did not install.`n`n" + $_.Exception.Message + "`n`nLog: $log") 'Error'
  exit 1
}
