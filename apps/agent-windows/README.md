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

## Démarrage automatique

```powershell
# Crée une tâche planifiée qui lance l'agent à l'ouverture de session (caché).
powershell -ExecutionPolicy Bypass -File install-agent.ps1 -Token <JETON> -Server https://votre-serveur
```

Pour désinstaller : `powershell -File install-agent.ps1 -Uninstall`

## Configuration

Au premier lancement, `--token`/`--server` sont enregistrés dans `config.json`.
Les lancements suivants n'ont besoin d'aucun argument.

## Notes

- Le filtrage web par `hosts` couvre les domaines de la liste de blocage de la
  politique. Pour un filtrage par catégorie au niveau DNS, un proxy/DNS dédié peut
  être ajouté ultérieurement.
- L'agent applique la politique en temps réel (échantillon 5 s) et synchronise la
  télémétrie toutes les 30 s par défaut.
