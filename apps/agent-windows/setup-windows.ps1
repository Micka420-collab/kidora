# Kidora — assistant d'installation guide pour un PARENT (aucune ligne de commande a taper).
#
# Fait tout le travail a la place de l'installateur :
#   1. verifie/installe Node.js (via winget si possible) ;
#   2. installe les dependances de l'agent ;
#   3. recupere le jeton d'appairage + l'adresse du serveur (colles, ou lus depuis
#      un fichier kidora-config.txt depose a cote, ou passes en parametre) ;
#   4. installe l'agent durci (auto-protection) et le demarre.
#
# Normalement lance par « Installer-Kidora.cmd » (qui l'execute en administrateur).
param(
  [string]$Token,
  [string]$Server,
  [string]$ChildUser,
  [switch]$NoSelfProtect,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Write-Head($t) { Write-Host ""; Write-Host "  $t" -ForegroundColor Cyan }
function Write-Ok($t)   { Write-Host "  [OK] $t" -ForegroundColor Green }
function Write-Warn($t) { Write-Host "  [!] $t" -ForegroundColor Yellow }
function Write-Err($t)  { Write-Host "  [X] $t" -ForegroundColor Red }

Write-Host ""
Write-Host "  ==================================================" -ForegroundColor Magenta
Write-Host "        Kidora - Installation de l'agent" -ForegroundColor Magenta
Write-Host "        Controle parental - PC de l'enfant" -ForegroundColor Magenta
Write-Host "  ==================================================" -ForegroundColor Magenta

# -- 1. Node.js ---------------------------------------------------------------
function Get-NodeMajor {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if (-not $n) { return 0 }
  try { return [int]((& node -p "process.versions.node.split('.')[0]") 2>$null) } catch { return 0 }
}

Write-Head "Etape 1/4 - Node.js"
$major = Get-NodeMajor
if ($major -ge 18) {
  Write-Ok "Node.js $(& node -v) detecte."
} else {
  Write-Warn "Node.js 18+ est requis et n'a pas ete trouve. Installation automatique..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    try {
      & winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent | Out-Null
    } catch { Write-Warn "L'installation via winget a echoue : $($_.Exception.Message)" }
    # Rafraichir le PATH de la session pour trouver node immediatement.
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user    = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
    $major = Get-NodeMajor
  }
  if ($major -ge 18) {
    Write-Ok "Node.js $(& node -v) installe."
  } else {
    Write-Err "Impossible d'installer Node.js automatiquement."
    Write-Host "  Installez-le manuellement (LTS) puis relancez cet installeur :" -ForegroundColor Yellow
    Write-Host "     https://nodejs.org/fr/download/prebuilt-installer" -ForegroundColor White
    try { Start-Process "https://nodejs.org/fr/download/prebuilt-installer" } catch {}
    throw "Node.js manquant."
  }
}

# -- 2. Dependances -----------------------------------------------------------
Write-Head "Etape 2/4 - Preparation de l'agent"
Push-Location $Root
try {
  # L'agent n'a pas de dependance native ; l'appel reste instantane et sur si
  # des dependances sont ajoutees un jour.
  & npm install --no-audit --no-fund --omit=dev 2>$null | Out-Null
  Write-Ok "Agent pret."
} catch {
  Write-Warn "npm install ignore ($($_.Exception.Message)) - l'agent fonctionne sans dependance externe."
} finally {
  Pop-Location
}

# -- 3. Jeton d'appairage + serveur -------------------------------------------
Write-Head "Etape 3/4 - Appairage"

# Priorite : parametres > fichier kidora-config.txt depose a cote > saisie interactive.
$cfgFile = Join-Path $Root "kidora-config.txt"
if ((-not $Token -or -not $Server) -and (Test-Path $cfgFile)) {
  Write-Ok "Fichier de configuration detecte (kidora-config.txt)."
  foreach ($line in Get-Content $cfgFile) {
    if ($line -match '^\s*SERVER\s*=\s*(.+?)\s*$' -and -not $Server) { $Server = $Matches[1] }
    if ($line -match '^\s*TOKEN\s*=\s*(.+?)\s*$'  -and -not $Token)  { $Token  = $Matches[1] }
  }
}

if (-not $Server) {
  Write-Host "  Adresse du serveur Kidora (ex. https://kidora.mondomaine.fr)" -ForegroundColor White
  $Server = Read-Host "  Serveur [http://localhost:3000]"
  if ([string]::IsNullOrWhiteSpace($Server)) { $Server = "http://localhost:3000" }
}
$Server = $Server.Trim().TrimEnd('/')

if (-not $Token) {
  Write-Host "  Jeton d'appairage - copiez-le depuis le tableau de bord :" -ForegroundColor White
  Write-Host "     Enfant > Appareils > Ajouter un appareil" -ForegroundColor Gray
  $Token = (Read-Host "  Jeton").Trim()
}
# Tolere un jeton colle sous forme d'URL/deep-link (kidorachild://enroll?token=XXX&server=YYY).
if ($Token -match '[?&]token=([^&]+)') { $Token = $Matches[1] }
if ($Token -match '[?&]server=([^&]+)') {
  $decoded = [System.Uri]::UnescapeDataString($Matches[1])
  if ($decoded) { $Server = $decoded.TrimEnd('/') }
}

if ([string]::IsNullOrWhiteSpace($Token)) {
  Write-Err "Aucun jeton fourni. Relancez l'installeur avec le jeton du tableau de bord."
  throw "Jeton manquant."
}
Write-Ok "Serveur : $Server"
Write-Ok "Jeton recu."

# -- 4. Installation durcie + demarrage ---------------------------------------
Write-Head "Etape 4/4 - Installation et protection"
$installer = Join-Path $Root "install-agent.ps1"
if (-not (Test-Path $installer)) { Write-Err "install-agent.ps1 introuvable."; throw "Fichier manquant." }

$installArgs = @{ Token = $Token; Server = $Server }
if ($ChildUser)     { $installArgs.ChildUser = $ChildUser }
if ($NoSelfProtect) { $installArgs.NoSelfProtect = $true }
if ($DryRun)        { $installArgs.DryRun = $true }
& $installer @installArgs

if ($DryRun) {
  Write-Warn "Mode simulation : aucune tache planifiee creee, agent non demarre."
} else {
  # Demarre tout de suite (sinon l'agent ne partirait qu'au prochain logon/boot).
  try {
    Start-ScheduledTask -TaskName "KidoraAgent" -ErrorAction Stop
    Write-Ok "Agent demarre."
  } catch {
    Write-Warn "L'agent demarrera a la prochaine ouverture de session (demarrage immediat impossible : $($_.Exception.Message))."
  }
}

if (-not $DryRun) {
  Write-Host ""
  Write-Host "  ==================================================" -ForegroundColor Green
  Write-Host "     [OK] Kidora est installe et actif." -ForegroundColor Green
  Write-Host "  ==================================================" -ForegroundColor Green
  Write-Host "  L'appareil apparaitra 'En ligne' dans votre tableau de bord" -ForegroundColor Gray
  Write-Host "  sous une minute. Vous pouvez fermer cette fenetre." -ForegroundColor Gray
  Write-Host ""
}
