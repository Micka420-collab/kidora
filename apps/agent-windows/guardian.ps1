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
# Runtime/writable files live in %ProgramData%\Kidora (writable by the standard
# child account); scripts stay in $AgentDir. Matches lib/paths.js. Falls back to
# $AgentDir until the agent's first run creates the data dir.
$DataDir = if ($env:ProgramData) { Join-Path $env:ProgramData "Kidora" } else { $AgentDir }
if (-not (Test-Path $DataDir)) { $DataDir = $AgentDir }
$logPath = Join-Path $DataDir "guardian.log"
$hbPath = Join-Path $DataDir "heartbeat.json"

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

# --- 2.5 Apply a staged, signature-verified self-update (swap + rollback) ---
# The agent (running as the child) downloads & verifies a newer version and stages
# it here; the guardian (SYSTEM) has the rights to replace the ACL-protected files.
$stagingDir = Join-Path $DataDir ".update-staging"
$readyFile = Join-Path $stagingDir ".update-ready"
if (Test-Path $readyFile) {
  $backupDir = Join-Path $DataDir ".update-backup"
  $target = "?"
  try { $target = (Get-Content $readyFile -Raw | ConvertFrom-Json).version } catch {}

  # Re-verify the staged update's SERVER signature (via node) before trusting it —
  # defence in depth so a planted/tampered staging dir is never swapped in, even
  # if its ACL were weakened. Reject and discard staging on failure.
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  $agentJs = Join-Path $AgentDir "agent.js"
  $verified = $false
  if ($node -and (Test-Path $agentJs)) {
    try {
      & $node $agentJs verify-update $stagingDir 2>$null | Out-Null
      $verified = ($LASTEXITCODE -eq 0)
    } catch { $verified = $false }
  }
  if (-not $verified) {
    Write-GLog "mise a jour $target REJETEE (signature invalide) — staging supprime"
    if (-not $DryRun) { Remove-Item -Recurse -Force $stagingDir -ErrorAction SilentlyContinue }
    return
  }

  Invoke-Step "appliquer la mise a jour de l'agent -> $target" {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    # Backup current agent.js + lib for rollback.
    if (Test-Path $backupDir) { Remove-Item -Recurse -Force $backupDir }
    New-Item -ItemType Directory -Path $backupDir | Out-Null
    Copy-Item (Join-Path $AgentDir "agent.js") $backupDir -Force
    Copy-Item (Join-Path $AgentDir "lib") (Join-Path $backupDir "lib") -Recurse -Force

    # Overlay every staged file (except the marker) onto the live dir.
    Get-ChildItem -Path $stagingDir -Recurse -File | Where-Object { $_.Name -ne ".update-ready" } | ForEach-Object {
      $rel = $_.FullName.Substring($stagingDir.Length).TrimStart('\', '/')
      $dest = Join-Path $AgentDir $rel
      $destDir = Split-Path $dest -Parent
      if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
      Copy-Item $_.FullName $dest -Force
    }
    Remove-Item -Recurse -Force $stagingDir

    # Clear the heartbeat so the "alive?" check reflects the NEW agent only, then
    # start it and wait for a fresh heartbeat; rollback if it never appears.
    Remove-Item $hbPath -Force -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName $TaskName
    $alive = $false
    for ($i = 0; $i -lt 12; $i++) {
      Start-Sleep -Seconds 2
      if (Test-Path $hbPath) {
        try {
          $hb2 = Get-Content $hbPath -Raw | ConvertFrom-Json
          if (([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [int64]$hb2.ts) -lt 60000) { $alive = $true; break }
        } catch {}
      }
    }
    if (-not $alive) {
      Write-GLog "mise a jour $target : agent non vivant -> ROLLBACK"
      Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
      Copy-Item (Join-Path $backupDir "agent.js") (Join-Path $AgentDir "agent.js") -Force
      Copy-Item (Join-Path $backupDir "lib\*") (Join-Path $AgentDir "lib") -Recurse -Force
      Start-ScheduledTask -TaskName $TaskName
    } else {
      Write-GLog "mise a jour $target appliquee avec succes"
    }
  }
  return # done for this tick; normal health checks resume next run
}

# --- 3. Health: running? heartbeat fresh? ---
$running = $task -and $task.State -eq "Running"

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
