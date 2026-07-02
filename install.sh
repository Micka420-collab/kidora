#!/usr/bin/env bash
#
# Kidora — installeur simple pour Ubuntu / Debian / Linux
# Installe et démarre le serveur + tableau de bord en une commande.
#
# Usage :
#   git clone https://github.com/Micka420-collab/kidora && cd kidora
#   bash install.sh            # installe puis build + démarre (prod)
#   bash install.sh --dev      # mode développement (hot reload)
#
set -euo pipefail

MODE="prod"
[ "${1:-}" = "--dev" ] && MODE="dev"

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
if [ ! -s dev.db ] || [ "${KIDORA_SEED:-1}" = "1" ]; then
  npm run seed || warn "Seed ignoré (déjà des données ?)"
fi
ok "Base prête"

# 5. Démarrage
if [ "$MODE" = "dev" ]; then
  ok "Installation terminée. Démarrage en mode développement…"
  echo "   → http://localhost:3000  (démo : demo@kidora.app / kidora1234)"
  exec npm run dev
else
  say "Build de production…"
  npm run build
  ok "Installation terminée. Démarrage du serveur…"
  echo "   → http://localhost:3000  (démo : demo@kidora.app / kidora1234)"
  exec npm start
fi
