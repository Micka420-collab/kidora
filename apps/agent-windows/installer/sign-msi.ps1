# Authenticode-sign an MSI with signtool.
#   With a real cert:   .\sign-msi.ps1 -MsiPath x.msi -CertPath code.pfx -CertPassword ****
#   Test (self-signed): .\sign-msi.ps1 -MsiPath x.msi      # NOT trusted by Windows
param(
  [Parameter(Mandatory)] [string]$MsiPath,
  [string]$CertPath,
  [string]$CertPassword,
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)
$ErrorActionPreference = "Stop"

# Locate the newest signtool.exe from the Windows SDK.
$signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { throw "signtool.exe not found (install the Windows 10/11 SDK)." }
$st = $signtool.FullName

if ($CertPath) {
  & $st sign /f $CertPath /p $CertPassword /fd SHA256 /tr $TimestampUrl /td SHA256 $MsiPath
} else {
  Write-Warning "No certificate supplied - creating a SELF-SIGNED TEST cert (not trusted by Windows)."
  $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Kidora Test" -CertStoreLocation Cert:\CurrentUser\My
  & $st sign /sha1 $cert.Thumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $MsiPath
}
if ($LASTEXITCODE -ne 0) { throw "signtool sign failed ($LASTEXITCODE)" }

& $st verify /pa $MsiPath
Write-Host "Signed + verified: $MsiPath"
