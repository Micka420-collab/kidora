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

# Ensure the WiX CLI is on PATH.
if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
  Write-Host "Installing WiX toolset (dotnet tool)..."
  dotnet tool install --global wix
  $env:PATH = "$env:PATH;$env:USERPROFILE\.dotnet\tools"
}
# Util extension (provides the WixQuietExec custom action).
wix extension add -g WixToolset.Util.wixext | Out-Null

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
