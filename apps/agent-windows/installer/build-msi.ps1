# Build the Kidora Agent MSI with WiX v4/v5.
#   .\build-msi.ps1 -Version 1.0.0
#   .\build-msi.ps1 -Version 1.0.0 -Sign -CertPath cert.pfx -CertPassword ****
# Requires the .NET SDK (for `dotnet tool install wix`). On GitHub's
# windows-latest runner both are preinstalled.
param(
  [string]$Version = "1.0.0",
  [string]$Output = "kidora-agent.msi",
  [switch]$Sign,
  [string]$CertPath,
  [string]$CertPassword
)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$agentSrc = Split-Path $here -Parent   # apps\agent-windows

# Pin WiX + the Util extension to the SAME version so the extension resolves
# (a mismatch yields WIX0144 "extension could not be found").
$WixVersion = "4.0.6"
Write-Host "Ensuring WiX $WixVersion (dotnet tool)..."
dotnet tool update --global wix --version $WixVersion
if ($LASTEXITCODE -ne 0) { throw "wix install/update failed ($LASTEXITCODE)" }
$env:PATH = "$env:PATH;$env:USERPROFILE\.dotnet\tools"

# Util extension (provides the WixQuietExec64 custom action) — same version.
wix extension add -g "WixToolset.Util.wixext/$WixVersion"
if ($LASTEXITCODE -ne 0) { throw "wix extension add failed ($LASTEXITCODE)" }

$msi = Join-Path $here $Output
Write-Host "Building $Output (v$Version) from $agentSrc ..."
wix build (Join-Path $here "kidora-agent.wxs") `
  -arch x64 -ext WixToolset.Util.wixext `
  -d Version=$Version -d AgentSrc=$agentSrc `
  -o $msi
if ($LASTEXITCODE -ne 0) { throw "wix build failed ($LASTEXITCODE)" }

if ($Sign) {
  & (Join-Path $here "sign-msi.ps1") -MsiPath $msi -CertPath $CertPath -CertPassword $CertPassword
}

Write-Host "OK -> $msi"
