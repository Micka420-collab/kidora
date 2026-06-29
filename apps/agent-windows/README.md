# Kidora Agent — Windows

Agent de contrôle parental pour Windows. Surveille l'usage des applications et du
web, applique les règles définies par les parents (blocage d'apps, filtrage web,
limites de temps d'écran, heure du coucher), et synchronise avec le serveur Kidora.

**Aucune dépendance npm** — Node.js (≥ 18) + PowerShell uniquement.

## Fonctionnalités

| Capacité | Mécanisme |
|---|---|
| App au premier plan + temps d'usage | Capteur PowerShell (`user32.dll`) |
| Blocage d'application | `Stop-Process` |
| Limite de temps par app | Compteur quotidien + `Stop-Process` |
| Filtrage web | **Proxy DNS local par catégorie** (sinkhole) — fallback fichier `hosts` ; **nécessite admin** |
| Limite de temps d'écran / coucher / pause | **Écran de blocage en superposition** (`overlay.ps1`) — se retire seul quand la condition se lève |
| Commandes à distance | `lock`, `message`, `pause`, … (pull au sync) |
| Télémétrie | Usage, événements, batterie → serveur |
| **Auto-protection (anti-arrêt)** | Gardien **SYSTEM** + redémarrage auto + ACL + heartbeat |

### Écran de blocage (au lieu du verrouillage complet)

Quand une condition globale s'applique (pause parentale, heure du coucher, limite
de temps d'écran atteinte), l'agent affiche un **overlay plein écran** branché
Kidora (`overlay.ps1`) au lieu de verrouiller la session Windows :

- couvre tous les écrans, topmost, sans bordure, avec un message clair + l'heure ;
- **se retire automatiquement** dès que la condition se lève (pause levée, bonus
  de temps accordé, fin du créneau coucher) — sans déconnecter l'enfant ;
- piloté par un fichier d'état JSON ; teardown fiable même après un crash de
  l'agent (balayage par ligne de commande).

> Le verrouillage complet (`LockWorkStation`) reste utilisé pour la commande
> distante explicite `lock` envoyée par le parent.

## Installation par MSI (recommandé)

Un **installeur MSI** signé empaquette l'agent et configure tout (enrôlement +
tâches planifiées + auto-protection) en une commande. Voir `installer/`.

```powershell
# Installation silencieuse (en administrateur). Node.js doit être installé.
msiexec /i kidora-agent.msi /qn TOKEN=<JETON> SERVER=https://votre-serveur CHILDUSER="PC\Enfant"
# Désinstallation (retire l'agent, les tâches et l'auto-protection) :
msiexec /x kidora-agent.msi /qn
```

Le MSI est bâti et signé par la CI (`.github/workflows/release-msi.yml`, tag
`agent-v*`) puis publié dans les Releases. Build local : `installer/build-msi.ps1`
(nécessite le SDK .NET + WiX). Signature : `installer/sign-msi.ps1` (certificat
de code, ou auto-signé de test). `CHILDUSER` est recommandé pour cibler le compte
de l'enfant ; sinon l'agent surveille le contexte d'installation.

## Installation rapide (sans MSI)

1. Dans le tableau de bord Kidora → enfant → **Appareils** → *Ajouter un appareil*
   (plateforme **Windows**). Copiez le **jeton d'enrôlement**.
2. Sur le PC de l'enfant :

```powershell
# Node.js requis : https://nodejs.org
cd kidora-agent
node agent.js --token <JETON> --server https://votre-serveur
```

> Pour le **filtrage web** (fichier hosts), lancez un terminal **en administrateur**.

### Mode test (sans blocage réel)

```powershell
node agent.js --token <JETON> --server http://localhost:3000 --dry-run
```

`--dry-run` surveille et synchronise mais ne tue **aucun** processus et ne verrouille
**pas** l'écran — idéal pour vérifier le bon fonctionnement.

## Démarrage automatique + auto-protection (anti-arrêt)

```powershell
# À lancer EN ADMINISTRATEUR pour activer l'auto-protection.
powershell -ExecutionPolicy Bypass -File install-agent.ps1 -Token <JETON> -Server https://votre-serveur
```

Par défaut, l'installeur met en place une **protection anti-arrêt** que l'enfant
(utilisateur standard) ne peut pas contourner :

- **Tâche agent durcie** : démarrage au logon **et** au boot, **redémarrage
  automatique** en cas d'échec (3×/min), masquée, sans limite de durée.
- **Gardien SYSTEM** (`guardian.ps1`, tâche `KidoraGuardian`, ~1 min) : tourne
  sous `NT AUTHORITY\SYSTEM` — **non tuable** par un compte standard. Il relance
  l'agent s'il est arrêté, le **réinstalle** s'il a été supprimé (depuis
  `KidoraAgent.xml`), le **réactive** s'il a été désactivé, et redémarre un agent
  **figé** (heartbeat périmé).
- **Heartbeat** : l'agent écrit `heartbeat.json` toutes les 30 s ; le gardien
  l'utilise pour détecter un agent bloqué (pas seulement tué).
- **ACL** : le groupe *Utilisateurs* passe en lecture seule sur le dossier de
  l'agent → impossible de supprimer/altérer les scripts.
- **Capteur auto-résilient** : si le sous-processus du capteur est tué, l'agent
  le relance automatiquement.

Options :

```powershell
# Cibler un compte enfant précis (par défaut : utilisateur courant)
... -Token <JETON> -ChildUser "PC\Enfant"

# Installer sans le gardien SYSTEM ni les ACL (ancien comportement)
... -Token <JETON> -NoSelfProtect

# Simulation : affiche les actions sans rien modifier
... -Token <JETON> -DryRun
```

Pour tout désinstaller (agent + gardien + ACL) :
`powershell -File install-agent.ps1 -Uninstall`

## Configuration

Au premier lancement, `--token`/`--server` sont enregistrés dans `config.json`.
Les lancements suivants n'ont besoin d'aucun argument.

## Filtrage web par catégorie (proxy DNS local)

En administrateur, l'agent lance un **mini-resolveur DNS local** (sinkhole, façon
Pi-hole, en Node pur — `lib/dns-proxy.js`) et bascule le DNS du système sur
`127.0.0.1`. Pour chaque requête il :

- **catégorise le domaine** (`lib/domains.js`) et bloque s'il appartient à une
  **catégorie interdite** (`webFilter.blockedCategories`) — y compris des domaines
  **inconnus du fichier hosts**, grâce aux signaux par mots-clés (porn, casino…) ;
- bloque la **liste de domaines** de la politique (et leurs sous-domaines) ;
- bloque tout domaine **non catégorisé** si `blockUnknown` est activé ;
- force la **recherche sécurisée** (Google/YouTube/Bing/DuckDuckGo) via CNAME si
  `safeSearch` est activé ;
- **transfère** les requêtes autorisées à un resolveur upstream (1.1.1.1).

Les domaines bloqués remontent au tableau de bord (`webVisits`). Si le port 53 est
indisponible ou hors admin, l'agent **retombe** sur le filtrage par `hosts`.
À l'arrêt (ou par le gardien après un crash), le DNS système est **restauré**.

## Notes

- L'agent applique la politique en temps réel (échantillon 5 s) et synchronise la
  télémétrie toutes les 30 s par défaut.
