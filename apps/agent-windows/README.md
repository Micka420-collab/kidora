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
| Filtrage web | Réécriture du fichier `hosts` (→ 127.0.0.1) — **nécessite admin** |
| Limite de temps d'écran / coucher / pause | Verrouillage du poste (`LockWorkStation`) |
| Commandes à distance | `lock`, `message`, `pause`, … (pull au sync) |
| Télémétrie | Usage, événements, batterie → serveur |
| **Auto-protection (anti-arrêt)** | Gardien **SYSTEM** + redémarrage auto + ACL + heartbeat |

## Installation rapide

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

## Notes

- Le filtrage web par `hosts` couvre les domaines de la liste de blocage de la
  politique. Pour un filtrage par catégorie au niveau DNS, un proxy/DNS dédié peut
  être ajouté ultérieurement.
- L'agent applique la politique en temps réel (échantillon 5 s) et synchronise la
  télémétrie toutes les 30 s par défaut.
