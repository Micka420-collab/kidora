#!/usr/bin/env bash
#
# Kidora — installeur simple pour Ubuntu / Debian / Linux
# Installe et démarre le serveur + tableau de bord en une commande.
#
# Usage :
#   git clone https://github.com/Micka420-collab/kidora && cd kidora
#   bash install.sh            # installe puis build + démarre (prod) — base VIDE,
#                              # vous créez votre compte sur /register
#   bash install.sh --dev      # mode développement (hot reload)
#   bash install.sh --demo     # ajoute un jeu de données de démonstration (éval)
#
# Une vraie installation ne crée AUCUN compte par défaut (pas d'identifiants connus
# en production). Utilisez --demo (ou KIDORA_SEED=1) uniquement pour évaluer.
set -euo pipefail

MODE="prod"
DEMO="${KIDORA_SEED:-0}"          # démo désactivée par défaut ; KIDORA_SEED=1 ou --demo pour l'activer
for arg in "$@"; do
  case "$arg" in
    --dev) MODE="dev" ;;
    --demo) DEMO="1" ;;
    *) : ;;
  esac
done

say()  { printf "\033[36m▸\033[0m %s\n" "$1"; }
ok()   { printf "\033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "\033[33m⚠\033[0m %s\n" "$1"; }
die()  { printf "\033[31m✗ %s\033[0m\n" "$1"; exit 1; }

cat <<'BANNER'
  __  __  Kidora — contrôle parental
  Installeur Linux / Ubuntu
BANNER

# 1. Node.js >= 20
need_node() {
  if command -v node >/dev/null 2>&1; then
    local major; major="$(node -p 'process.versions.node.split(".")[0]')"
    [ "$major" -ge 20 ] && return 0
  fi
  return 1
}

if ! need_node; then
  warn "Node.js 20+ est requis et n'a pas été trouvé."
  if command -v apt-get >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
    say "Installation de Node.js 20 via NodeSource…"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    die "Installez Node.js 20+ (https://nodejs.org ou nvm) puis relancez ce script."
  fi
fi
ok "Node $(node -v) détecté"

# 2. Dépendances du serveur
cd "$(dirname "$0")/apps/server"
say "Installation des dépendances (npm)…"
npm install --no-audit --no-fund

# 3. Environnement
if [ ! -f .env ]; then
  say "Création du fichier .env…"
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"
  ENC="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')"
  CRON="$(node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))')"
  cat > .env <<EOF
DATABASE_URL="file:./dev.db"
AUTH_SECRET="$SECRET"
DATA_ENC_KEY="$ENC"
# Enables the in-process scheduler (retention, offline-check, weekly reports) on
# self-host — the routes are fail-closed without it.
CRON_SECRET="$CRON"
EOF
  ok "Secrets générés dans apps/server/.env"
fi

# 4. Base de données
say "Préparation de la base de données…"
npx prisma generate
npx prisma migrate deploy
if [ "$DEMO" = "1" ]; then
  say "Insertion des données de démonstration (--demo)…"
  # SEED_DEMO=1 lève le garde anti-production ; SEED_FORCE=1 autorise l'écrasement
  # d'une base déjà semée pour ré-évaluer proprement.
  SEED_DEMO=1 SEED_FORCE=1 npm run seed || warn "Seed de démo ignoré."
else
  say "Aucune donnée de démonstration (installation réelle) — créez votre compte sur /register."
fi
ok "Base prête"

# 5. Démarrage
if [ "$DEMO" = "1" ]; then
  login_hint="démo : demo@kidora.app / kidora1234"
else
  login_hint="créez votre compte : http://localhost:3000/register"
fi
if [ "$MODE" = "dev" ]; then
  ok "Installation terminée. Démarrage en mode développement…"
  echo "   → http://localhost:3000  ($login_hint)"
  exec npm run dev
else
  say "Build de production…"
  npm run build
  ok "Installation terminée. Démarrage du serveur…"
  echo "   → http://localhost:3000  ($login_hint)"
  exec npm start
fi
