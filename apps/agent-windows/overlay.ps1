# Kidora — écran de blocage en superposition (au lieu du verrouillage complet).
# Fenêtre plein écran, topmost, sans bordure, couvrant tous les moniteurs.
# Pilotée par un fichier d'état JSON : { active, title, message }.
#   - tant que active=true et que le fichier existe, l'overlay reste affiché ;
#   - dès que active=false (ou fichier supprimé), l'overlay se ferme tout seul.
# L'agent l'affiche/le masque via lib/win.js (showOverlay / hideOverlay).
#
#   powershell -File overlay.ps1 -StateFile <chemin>
#   powershell -File overlay.ps1 -Validate     # construit la fenêtre sans l'afficher (test)
param(
  [string]$StateFile,
  [switch]$Validate
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

# Script-scoped so the Timer event handler reliably sees it (event scriptblocks
# don't capture local params the way you'd expect).
$script:StateFilePath = $StateFile

function Read-State {
  param([string]$path)
  if ([string]::IsNullOrEmpty($path) -or -not (Test-Path $path)) { return $null }
  try { return Get-Content -Path $path -Raw | ConvertFrom-Json } catch { return $null }
}

$brand = [System.Drawing.Color]::FromArgb(30, 27, 75)   # indigo-950
$accent = [System.Drawing.Color]::FromArgb(129, 140, 248) # indigo-400

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.BackColor = $brand
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.StartPosition = 'Manual'
$form.KeyPreview = $true
# Couvre tout le bureau virtuel (multi-écrans).
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$form.Bounds = $vs

$icon = New-Object System.Windows.Forms.Label
$icon.Text = [System.Char]::ConvertFromUtf32(0x1F6E1)  # 🛡 bouclier (hors BMP → surrogate pair)
$icon.Font = New-Object System.Drawing.Font("Segoe UI Emoji", 64)
$icon.ForeColor = $accent
$icon.AutoSize = $false
$icon.TextAlign = 'MiddleCenter'

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 30, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = [System.Drawing.Color]::White
$titleLabel.AutoSize = $false
$titleLabel.TextAlign = 'MiddleCenter'

$msgLabel = New-Object System.Windows.Forms.Label
$msgLabel.Font = New-Object System.Drawing.Font("Segoe UI", 16)
$msgLabel.ForeColor = [System.Drawing.Color]::FromArgb(199, 210, 254)
$msgLabel.AutoSize = $false
$msgLabel.TextAlign = 'MiddleCenter'

$clock = New-Object System.Windows.Forms.Label
$clock.Font = New-Object System.Drawing.Font("Segoe UI", 14)
$clock.ForeColor = [System.Drawing.Color]::FromArgb(129, 140, 248)
$clock.AutoSize = $false
$clock.TextAlign = 'MiddleCenter'

# Disposition centrée (recalculée au resize).
function Set-Layout {
  $w = $form.ClientSize.Width
  $h = $form.ClientSize.Height
  $cy = [int]($h / 2)
  $icon.SetBounds(0, $cy - 200, $w, 110)
  $titleLabel.SetBounds(0, $cy - 80, $w, 60)
  $msgLabel.SetBounds([int]($w/2) - 400, $cy - 10, 800, 80)
  $clock.SetBounds(0, $cy + 90, $w, 40)
}

$form.Controls.AddRange(@($icon, $titleLabel, $msgLabel, $clock))
$form.Add_Shown({ Set-Layout })
$form.Add_Resize({ Set-Layout })

# Empêche la fermeture par l'utilisateur (Alt+F4 / croix) — seul l'agent ferme.
$script:allowClose = $false
$form.Add_FormClosing({
  param($s, $e)
  if (-not $script:allowClose -and $e.CloseReason -eq [System.Windows.Forms.CloseReason]::UserClosing) {
    $e.Cancel = $true
  }
})
# Avale les touches (Alt+F4, etc.).
$form.Add_KeyDown({ param($s, $e) $e.SuppressKeyPress = $true; $e.Handled = $true })

# Boucle de surveillance : applique l'état, réaffirme le topmost, met l'heure à jour.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
  $clock.Text = (Get-Date -Format "HH:mm")
  $st = Read-State -path $script:StateFilePath
  if (-not $st -or -not $st.active) {
    $script:allowClose = $true
    $timer.Stop()
    $form.Close()
    return
  }
  $titleLabel.Text = if ($st.title) { [string]$st.title } else { "Kidora" }
  $msgLabel.Text = if ($st.message) { [string]$st.message } else { "" }
  # Garde l'overlay au premier plan.
  $form.TopMost = $true
  $form.BringToFront()
  [System.Windows.Forms.NativeWindow]::FromHandle($form.Handle) | Out-Null
})

# Mode validation : on construit toute la fenêtre puis on sort sans l'afficher.
if ($Validate) {
  Set-Layout
  $clock.Text = (Get-Date -Format "HH:mm")
  Write-Output "overlay.ps1 OK (form built, not shown)"
  $form.Dispose()
  exit 0
}

if (-not $StateFile) { Write-Error "-StateFile requis"; exit 1 }

# Affiche immédiatement l'état initial (s'il existe), sinon attend qu'il devienne actif.
$init = Read-State -path $StateFile
$titleLabel.Text = if ($init -and $init.title) { [string]$init.title } else { "Kidora" }
$msgLabel.Text = if ($init -and $init.message) { [string]$init.message } else { "" }
$clock.Text = (Get-Date -Format "HH:mm")

$timer.Start()
[System.Windows.Forms.Application]::Run($form)
