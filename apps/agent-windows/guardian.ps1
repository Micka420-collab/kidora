# Kidora Guardian — veille anti-arrêt de l'agent.
# Exécuté par une tâche planifiée SYSTEM (toutes les ~1 min) que l'enfant
# (utilisateur standard) ne peut ni arrêter ni supprimer. Il :
#   - réinstalle la tâche de l'agent si elle a été supprimée (depuis le XML exporté),
#   - la réactive si elle a été désactivée,
#   - (re)démarre l'agent s'il n'est pas en cours d'exécution,
#   - redémarre un agent figé (heartbeat périmé).
#
# -DryRun : journalise les actions sans rien modifier (test sûr).
param(
  [string]$AgentDir = $PSScriptRoot,
  [string]$TaskName = "KidoraAgent",
  [int]$StaleMinutes = 4,
  [switch]$DryRun
)

$ErrorActionPreference = "SilentlyContinue"
$logPath = Join-Path $AgentDir "guardian.log"

function Write-GLog([string]$msg) {
  $prefix = if ($DryRun) { "[DRYRUN] " } else { "" }
  $line = "{0} {1}{2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $prefix, $msg
  try { Add-Content -Path $logPath -Value $line -Encoding utf8 } catch {}
  Write-Output $line
}

function Invoke-Step([string]$desc, [scriptblock]$action) {
  if ($DryRun) { Write-GLog "WOULD: $desc"; return }
  Write-GLog "DOING: $desc"
  & $action
}

# --- 1. Ensure the agent task exists (restore from exported XML if deleted) ---
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  $xmlPath = Join-Path $AgentDir "$TaskName.xml"
  if (Test-Path $xmlPath) {
    Invoke-Step "réinstaller la tâche '$TaskName' depuis $TaskName.xml" {
      Register-ScheduledTask -TaskName $TaskName -Xml (Get-Content -Path $xmlPath -Raw) -Force | Out-Null
    }
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  } else {
    Write-GLog "tâche '$TaskName' absente et aucun $TaskName.xml pour la restaurer"
    return
  }
}

# --- 2. Re-enable if the child disabled it ---
if ($task -and $task.State -eq "Disabled") {
  Invoke-Step "réactiver la tâche '$TaskName'" {
    Enable-ScheduledTask -TaskName $TaskName | Out-Null
  }
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

# --- 3. Health: running? heartbeat fresh? ---
$running = $task -and $task.State -eq "Running"

$hbPath = Join-Path $AgentDir "heartbeat.json"
$stale = $true
if (Test-Path $hbPath) {
  try {
    $hb = Get-Content -Path $hbPath -Raw | ConvertFrom-Json
    if ($hb.ts) {
      $ageMs = ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [int64]$hb.ts)
      $stale = $ageMs -gt ($StaleMinutes * 60 * 1000)
    }
  } catch {}
}

if (-not $running) {
  Invoke-Step "démarrer l'agent (tâche à l'arrêt)" {
    Start-ScheduledTask -TaskName $TaskName
  }
} elseif ($stale) {
  Invoke-Step "redémarrer l'agent figé (heartbeat périmé > $StaleMinutes min)" {
    Stop-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskName $TaskName
  }
} else {
  Write-GLog "OK — agent en cours, heartbeat frais"
}
