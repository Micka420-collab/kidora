#!/usr/bin/env bash
#
# Kidora agent — installeur Linux (service systemd utilisateur).
#
#   ./install-linux.sh --token <JETON> --server https://serveur
#   ./install-linux.sh --uninstall
#   ./install-linux.sh --dry-run --token x            # simulation
#
# Le service tourne dans la session de l'utilisateur (accès au bureau pour la
# détection d'app, l'écran de blocage et les notifications). Le blocage d'apps et
# le temps d'écran fonctionnent sans privilèges ; le filtrage web (/etc/hosts)
# nécessite les droits root (lancez alors l'agent avec les droits adéquats).
set -euo pipefail

TOKEN=""
SERVER="http://localhost:3000"
UNINSTALL=0
DRYRUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN="${2:-}"; shift 2 ;;
    --server) SERVER="${2:-}"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    --dry-run) DRYRUN=1; shift ;;
    *) echo "Option inconnue : $1"; exit 1 ;;
  esac
done

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
WHOAMI="$(id -un 2>/dev/null || echo "${USER:-user}")"
SERVICE="kidora-agent"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/$SERVICE.service"

say()  { printf "\033[36m▸\033[0m %s\n" "$1"; }
ok()   { printf "\033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "\033[33m⚠\033[0m %s\n" "$1"; }
run()  { if [ "$DRYRUN" = 1 ]; then echo "[DRYRUN] $*"; else eval "$@"; fi; }

if [ "$UNINSTALL" = 1 ]; then
  say "Désinstallation de l'agent Kidora…"
  run "systemctl --user disable --now '$SERVICE' 2>/dev/null || true"
  run "rm -f '$UNIT'"
  run "systemctl --user daemon-reload 2>/dev/null || true"
  if [ -w /etc/hosts ]; then
    run "sed -i '/# >>> KIDORA START/,/# <<< KIDORA END/d' /etc/hosts || true"
  fi
  ok "Agent Kidora désinstallé."
  exit 0
fi

command -v node >/dev/null 2>&1 || { echo "Node.js 18+ requis. Installez-le puis relancez."; exit 1; }
NODE="$(command -v node)"

if [ -z "$TOKEN" ]; then
  printf "  Jeton d'appairage (tableau de bord → enfant → Appareils) : "
  read -r TOKEN
fi
[ -z "$TOKEN" ] && { echo "Jeton requis."; exit 1; }
SERVER="${SERVER%/}"

say "Enregistrement de la configuration (enroll-only)…"
run "'$NODE' '$AGENT_DIR/agent.js' --token '$TOKEN' --server '$SERVER' --enroll-only"

say "Installation du service systemd utilisateur '$SERVICE'…"
run "mkdir -p '$UNIT_DIR'"
if [ "$DRYRUN" = 1 ]; then
  echo "[DRYRUN] écrire $UNIT"
else
  cat > "$UNIT" <<EOF
[Unit]
Description=Kidora parental-control agent
After=graphical-session.target network-online.target

[Service]
ExecStart=$NODE $AGENT_DIR/agent.js
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
fi
run "systemctl --user daemon-reload"
run "systemctl --user enable --now '$SERVICE'"
# Démarrer au boot même sans session ouverte.
run "loginctl enable-linger \"$WHOAMI\" 2>/dev/null || true"

ok "Agent Kidora installé (service utilisateur '$SERVICE')."
warn "Filtrage web via /etc/hosts : nécessite les droits root. Sinon, blocage d'apps + temps d'écran restent actifs."
say "Statut :  systemctl --user status $SERVICE"
