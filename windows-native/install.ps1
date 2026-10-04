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
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $need = @()
  foreach ($f in @(Get-ChildItem (Join-Path $here 'deps') -Filter *.appx -ErrorAction SilentlyContinue)) {
    try {
      $z = [IO.Compression.ZipFile]::OpenRead($f.FullName)
      $e = $z.Entries | Where-Object { $_.FullName -eq 'AppxManifest.xml' }
      $r = New-Object IO.StreamReader($e.Open()); $x = [xml]$r.ReadToEnd(); $r.Close(); $z.Dispose()
      $nm = $x.Package.Identity.Name; $ver = [version]$x.Package.Identity.Version
      $have = Get-AppxPackage -Name $nm -ErrorAction SilentlyContinue | Where-Object { [version]$_.Version -ge $ver }
      if ($have) { Write-Host "Dependency $nm already installed, skipping" } else { Write-Host "Dependency $nm needed"; $need += $f.FullName }
    } catch { Write-Host "Could not inspect $($f.Name): $($_.Exception.Message)" }
  }
  $msix = Join-Path $here $cfg.msix
  Get-AppxPackage -Name $cfg.name -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction SilentlyContinue
  if ($need.Count -gt 0) { Add-AppxPackage -Path $msix -DependencyPath $need } else { Add-AppxPackage -Path $msix }
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
