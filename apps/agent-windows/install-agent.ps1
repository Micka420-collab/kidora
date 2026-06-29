# Installe (ou désinstalle) l'agent Kidora comme tâche planifiée au démarrage.
#   .\install-agent.ps1 -Token <JETON> -Server https://serveur
#   .\install-agent.ps1 -Uninstall
param(
  [string]$Token,
  [string]$Server = "http://localhost:3000",
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$TaskName = "KidoraAgent"
$AgentDir = $PSScriptRoot
$AgentJs = Join-Path $AgentDir "agent.js"

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Agent Kidora désinstallé." -ForegroundColor Green
  exit 0
}

if (-not $Token) { Write-Error "Paramètre -Token requis."; exit 1 }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Error "Node.js introuvable. Installez-le depuis https://nodejs.org"; exit 1 }

# Enregistre la config tout de suite
& $node $AgentJs --token $Token --server $Server --enroll-only 2>$null

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$AgentJs`"" -WorkingDirectory $AgentDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Hidden
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Agent Kidora installé (tâche planifiée '$TaskName')." -ForegroundColor Green
Write-Host "Il démarrera automatiquement à la prochaine ouverture de session." -ForegroundColor Gray
Write-Host "Pour démarrer maintenant : Start-ScheduledTask -TaskName $TaskName" -ForegroundColor Gray
