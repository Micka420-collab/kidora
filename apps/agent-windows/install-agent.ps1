# Installe (ou désinstalle) l'agent Kidora avec auto-protection (anti-arrêt).
#
#   .\install-agent.ps1 -Token <JETON> -Server https://serveur
#   .\install-agent.ps1 -Token <JETON> -ChildUser "PC\Enfant"   # cible un compte
#   .\install-agent.ps1 -Token <JETON> -NoSelfProtect           # sans gardien SYSTEM
#   .\install-agent.ps1 -DryRun -Token x                        # simulation (aucune modif)
#   .\install-agent.ps1 -Uninstall
#
# Auto-protection (par défaut, nécessite des droits administrateur) :
#   - tâche agent durcie : redémarrage auto en cas d'échec, démarrage au logon ET
#     au boot, masquée, sans limite de durée ;
#   - tâche gardien SYSTEM "KidoraGuardian" (~1 min) que l'enfant ne peut pas tuer,
#     qui relance/réinstalle l'agent (voir guardian.ps1) ;
#   - ACL : le groupe Utilisateurs ne peut plus modifier/supprimer les fichiers.
param(
  [string]$Token,
  [string]$Server = "http://localhost:3000",
  [string]$ChildUser,
  [switch]$NoSelfProtect,
  [switch]$DryRun,
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$TaskName = "KidoraAgent"
$GuardianTask = "KidoraGuardian"
$AgentDir = $PSScriptRoot
$AgentJs = Join-Path $AgentDir "agent.js"
$GuardianPs1 = Join-Path $AgentDir "guardian.ps1"
$TaskXml = Join-Path $AgentDir "$TaskName.xml"
# Writable runtime data (config, heartbeat, offline cache, update staging) lives
# here so the standard child account can write it while the scripts stay locked.
# Must match lib/paths.js and guardian.ps1.
$DataDir = if ($env:ProgramData) { Join-Path $env:ProgramData "Kidora" } else { $AgentDir }

function Invoke-Step([string]$desc, [scriptblock]$action) {
  if ($DryRun) { Write-Host "[DRYRUN] $desc" -ForegroundColor Yellow; return }
  & $action
}

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ─────────────────────────── Uninstall ───────────────────────────
if ($Uninstall) {
  Invoke-Step "supprimer la tâche $GuardianTask" {
    Unregister-ScheduledTask -TaskName $GuardianTask -Confirm:$false -ErrorAction SilentlyContinue
  }
  Invoke-Step "supprimer la tâche $TaskName" {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  }
  Invoke-Step "restaurer le DNS système (DHCP automatique)" {
    Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
      Where-Object { $_.Status -eq 'Up' } |
      Set-DnsClientServerAddress -ResetServerAddresses -ErrorAction SilentlyContinue
    ipconfig /flushdns | Out-Null
  }
  Invoke-Step "nettoyer le fichier hosts (bloc Kidora)" {
    $hostsPath = Join-Path $env:windir 'System32\drivers\etc\hosts'
    if (Test-Path $hostsPath) {
      $raw = Get-Content $hostsPath -Raw
      # Strip the managed block (markers written by lib/win.js), incl. leading blank lines.
      $cleaned = [regex]::Replace($raw, '(?s)\r?\n*# >>> KIDORA START.*?# <<< KIDORA END', '')
      Set-Content -Path $hostsPath -Value $cleaned -Encoding ascii
    }
  }
  Invoke-Step "réinitialiser les ACL de $AgentDir" {
    icacls "$AgentDir" /reset /T /C /Q | Out-Null
  }
  Invoke-Step "nettoyer les fichiers d'état (heartbeat, xml, logs)" {
    Remove-Item (Join-Path $AgentDir "heartbeat.json"), $TaskXml, (Join-Path $AgentDir "guardian.log") -ErrorAction SilentlyContinue
  }
  Invoke-Step "supprimer le dossier de données $DataDir" {
    if ($DataDir -ne $AgentDir -and (Test-Path $DataDir)) {
      Remove-Item -Recurse -Force $DataDir -ErrorAction SilentlyContinue
    }
  }
  Write-Host "Agent Kidora désinstallé." -ForegroundColor Green
  exit 0
}

# ─────────────────────────── Install ───────────────────────────
if (-not $Token) { Write-Error "Paramètre -Token requis."; exit 1 }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Error "Node.js introuvable. Installez-le depuis https://nodejs.org"; exit 1 }

$selfProtect = -not $NoSelfProtect
if ($selfProtect -and -not (Test-Admin)) {
  Write-Warning "Auto-protection demandée mais session non-administrateur : le gardien SYSTEM et les ACL seront ignorés. Relancez en administrateur, ou utilisez -NoSelfProtect."
  $selfProtect = $false
}

$userId = if ($ChildUser) { $ChildUser } else { "$env:USERDOMAIN\$env:USERNAME" }

# Dossier de données inscriptible par l'enfant (compte standard) : l'agent y
# écrit config/heartbeat/état/mises à jour même quand les scripts sont en lecture
# seule. SYSTEM/Admins gardent le contrôle total (hérité de ProgramData) → le
# gardien peut lire/remplacer ; les scripts, eux, restent protégés dans $AgentDir.
Invoke-Step "créer le dossier de données $DataDir (inscriptible par l'enfant)" {
  if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
  if ($DataDir -ne $AgentDir) {
    # Grant BUILTIN\Users Modify (create/write/delete their own runtime files).
    icacls "$DataDir" /grant:r "*S-1-5-32-545:(OI)(CI)M" /C /Q | Out-Null
  }
}

# Persiste la config (jeton/serveur) sans démarrer la boucle.
Invoke-Step "enregistrer la configuration (enroll-only)" {
  & $node $AgentJs --token $Token --server $Server --enroll-only 2>$null
}

# Tâche agent durcie (session utilisateur, car la surveillance a besoin du bureau).
Invoke-Step "enregistrer la tâche '$TaskName' (durcie) pour $userId" {
  $action = New-ScheduledTaskAction -Execute $node -Argument "`"$AgentJs`"" -WorkingDirectory $AgentDir
  $triggers = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $userId),
    (New-ScheduledTaskTrigger -AtStartup)
  )
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -Hidden -MultipleInstances IgnoreNew `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
  $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Highest
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
    -Settings $settings -Principal $principal -Force | Out-Null
}

if ($selfProtect) {
  # Exporte la définition pour que le gardien puisse réinstaller la tâche si l'enfant la supprime.
  # (UTF-8 sans BOM, sinon Register-ScheduledTask -Xml peut échouer.)
  Invoke-Step "exporter $TaskName vers $TaskName.xml (restauration par le gardien)" {
    $xml = Export-ScheduledTask -TaskName $TaskName
    [System.IO.File]::WriteAllText($TaskXml, $xml, (New-Object System.Text.UTF8Encoding($false)))
  }

  # Gardien SYSTEM : impossible à tuer par un utilisateur standard ; vérifie toutes les ~1 min.
  Invoke-Step "enregistrer la tâche gardien SYSTEM '$GuardianTask'" {
    $gAction = New-ScheduledTaskAction -Execute "powershell.exe" `
      -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$GuardianPs1`"" -WorkingDirectory $AgentDir
    $gTriggers = @(
      (New-ScheduledTaskTrigger -AtStartup),
      (New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) `
        -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650))
    )
    $gSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -StartWhenAvailable -Hidden -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    $gPrincipal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $GuardianTask -Action $gAction -Trigger $gTriggers `
      -Settings $gSettings -Principal $gPrincipal -Force | Out-Null
  }

  # ACL : Utilisateurs en lecture/exécution seulement → l'enfant ne peut pas supprimer/altérer les scripts.
  Invoke-Step "durcir les ACL de $AgentDir (Utilisateurs = lecture seule)" {
    icacls "$AgentDir" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX" /T /C /Q | Out-Null
  }
}

Write-Host ""
if ($DryRun) {
  Write-Host "[DRYRUN] Aucune modification effectuée." -ForegroundColor Yellow
} else {
  Write-Host "Agent Kidora installé (tâche '$TaskName')." -ForegroundColor Green
  if ($selfProtect) {
    Write-Host "Auto-protection ACTIVE : gardien SYSTEM '$GuardianTask' + ACL + redémarrage auto." -ForegroundColor Green
  } else {
    Write-Host "Auto-protection désactivée." -ForegroundColor Gray
  }
  Write-Host "Démarrer maintenant : Start-ScheduledTask -TaskName $TaskName" -ForegroundColor Gray
}
