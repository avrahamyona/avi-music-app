param([string]$Build = '0')
$ErrorActionPreference = 'Stop'
$root = Get-Location
$test = Get-ChildItem -Directory AviWin/windows/AviWin.Package/AppPackages | Where-Object { $_.Name -like '*_Test' } | Select-Object -First 1
if (-not $test) { throw 'no *_Test package folder' }
$msixSrc = Get-ChildItem $test.FullName -Filter *.msix | Select-Object -First 1
if (-not $msixSrc) { $msixSrc = Get-ChildItem $test.FullName -Filter *.appx | Select-Object -First 1 }
if (-not $msixSrc) { throw 'no msix/appx in package folder' }
Write-Host "Package: $($msixSrc.FullName)"
Get-ChildItem -Recurse $test.FullName | Select-Object -First 40 FullName

$stage = Join-Path $root 'stage'
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $stage, "$stage\deps" | Out-Null
Copy-Item $msixSrc.FullName "$stage\AviMusic.msix"
Get-ChildItem (Join-Path $test.FullName 'Dependencies\x64') -Filter *.appx -ErrorAction SilentlyContinue | Copy-Item -Destination "$stage\deps"

# Read identity from the manifest inside the package
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("$stage\AviMusic.msix")
$entry = $zip.Entries | Where-Object { $_.FullName -eq 'AppxManifest.xml' }
$sr = New-Object System.IO.StreamReader($entry.Open())
[xml]$mf = $sr.ReadToEnd()
$sr.Close(); $zip.Dispose()
$ns = New-Object Xml.XmlNamespaceManager($mf.NameTable)
$ns.AddNamespace('m', 'http://schemas.microsoft.com/appx/manifest/foundation/windows10')
$pub = $mf.SelectSingleNode('//m:Identity', $ns).GetAttribute('Publisher')
$name = $mf.SelectSingleNode('//m:Identity', $ns).GetAttribute('Name')
$appId = $mf.SelectSingleNode('//m:Application', $ns).GetAttribute('Id')
Write-Host "Identity: $name  Publisher: $pub  App: $appId"

# Self-signed certificate whose subject equals the package publisher
$certPw = ConvertTo-SecureString -String 'avi-music-ci' -Force -AsPlainText
$cert = New-SelfSignedCertificate -Type Custom -Subject $pub -KeyUsage DigitalSignature -FriendlyName 'Avi Music' `
  -CertStoreLocation 'Cert:\CurrentUser\My' -KeyExportPolicy Exportable `
  -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
Export-PfxCertificate -Cert $cert -FilePath "$root\avi.pfx" -Password $certPw | Out-Null
Export-Certificate -Cert $cert -FilePath "$stage\AviMusic.cer" | Out-Null

$signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe |
  Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { throw 'signtool not found' }
& $signtool.FullName sign /fd SHA256 /f "$root\avi.pfx" /p 'avi-music-ci' "$stage\AviMusic.msix"
if ($LASTEXITCODE -ne 0) { throw 'signtool failed' }

# Verify: trust the cert on this runner and require a Valid signature
Import-Certificate -FilePath "$stage\AviMusic.cer" -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
$sig = Get-AuthenticodeSignature "$stage\AviMusic.msix"
Write-Host "Signature status: $($sig.Status)  signer: $($sig.SignerCertificate.Subject)"
if ($sig.Status -ne 'Valid') { throw "msix signature is not Valid: $($sig.Status)" }

@{ name = $name; appId = $appId; msix = 'AviMusic.msix' } | ConvertTo-Json | Set-Content "$stage\config.json"
Copy-Item "$root\windows-native\install.ps1" "$stage\install.ps1"

choco install innosetup -y --no-progress | Out-Null
$iss = @"
[Setup]
AppName=Avi Music
AppVersion=0.2.0.$Build
DefaultDirName={tmp}\AviMusicSetup
PrivilegesRequired=admin
OutputDir=out
OutputBaseFilename=AviMusic-Setup
Compression=lzma
SolidCompression=yes
CreateAppDir=no
Uninstallable=no
DisableDirPage=yes
DisableProgramGroupPage=yes
[Files]
Source: "$stage\*"; DestDir: "{tmp}\AviMusicPkg"; Flags: recursesubdirs createallsubdirs deleteafterinstall
[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\AviMusicPkg\install.ps1"""; StatusMsg: "Installing Avi Music..."; Flags: waituntilterminated
"@
Set-Content -Path AviMusic.iss -Value $iss
& 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' AviMusic.iss
Get-ChildItem out
