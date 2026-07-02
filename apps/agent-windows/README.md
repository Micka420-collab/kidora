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

## Installation en un clic (parent, sans terminal)

Le plus simple : **double-cliquez `Installer-Kidora.cmd`**. Il se relance en
administrateur puis déroule un assistant guidé (`setup-windows.ps1`) qui fait tout
le travail à la place de l'installateur :

1. **vérifie / installe Node.js** automatiquement (via winget, sinon ouvre la page
   de téléchargement) ;
2. prépare l'agent ;
3. demande (ou lit) le **jeton d'appairage** et l'**adresse du serveur** — accepte
   un jeton collé tel quel **ou** un lien d'appairage complet
   (`kidorachild://enroll?token=…&server=…`) ;
4. installe l'agent **durci** (auto-protection) et le **démarre** immédiatement.

Zéro question possible : déposez un fichier `kidora-config.txt` à côté de
l'installeur (`SERVER=https://votre-serveur` / `TOKEN=<jeton>`) et l'assistant
n'affiche plus aucune invite. Prévisualiser sans rien modifier :

```powershell
powershell -ExecutionPolicy Bypass -File setup-windows.ps1 -DryRun
```

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

## Diagnostic (`doctor`)

En cas de doute sur une installation, lancez l'auto-diagnostic :

```powershell
node agent.js doctor      # ou : npm run doctor
```

Il affiche une **liste de contrôle** (✓/⚠/✗) : version de Node, configuration
(jeton/serveur/enrôlement), **serveur joignable** (`/api/health`), agent en cours
d'exécution (fraîcheur du heartbeat), droits administrateur, **écriture du cache
hors-ligne** (`state.json`), et présence/état des tâches planifiées `KidoraAgent`
et `KidoraGuardian`. Le code de sortie est **non nul** si un problème bloquant est
détecté — pratique pour un support ou un script post-installation.

## Découverte du serveur sur le réseau (LAN)

Si aucune adresse de serveur n'est fournie, l'installateur tente de **trouver le
serveur Kidora sur le réseau local** (`node agent.js discover`) — pratique en
auto-hébergement pour ne rien avoir à taper. Mécanisme : une balise **multicast
UDP** (groupe admin-scoped `239.255.42.99:5354`, style mDNS). Côté serveur,
lancez l'annonceur à côté du serveur :

```bash
node scripts/lan-advertise.mjs            # détecte l'IP LAN + le port
node scripts/lan-advertise.mjs --url http://192.168.1.50:3000 --name "Maison"
```

Best-effort : le multicast peut être bloqué par un pare-feu ou indisponible
selon l'interface — l'installateur retombe alors sur la saisie manuelle.

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

## Mise à jour automatique (signée)

L'agent se met à jour tout seul, sans réinstallation par le parent :

- au `sync`, le serveur annonce la dernière version (`agentLatest`) ;
- si elle est plus récente, l'agent télécharge le **bundle signé**
  (`GET /api/agent/bundle`), **vérifie la signature Ed25519** et le **hachage du
  contenu** avec la clé publique épinglée (`lib/updater.js`), puis **prépare**
  les fichiers dans `.update-staging/` — rien n'est appliqué à chaud ;
- le **gardien SYSTEM** applique le remplacement au tick suivant : **sauvegarde**
  de la version courante, copie des fichiers, redémarrage, et **rollback
  automatique** si le nouvel agent ne redonne pas de heartbeat.

Aucune mise à jour non signée n'est jamais appliquée. Désactivable :
`"autoUpdate": false` dans `config.json`.

## Hors connexion (résilience)

L'agent est conçu pour **continuer à protéger même quand le serveur est
injoignable** (réseau coupé, serveur en panne, PC redémarré sans Internet) :

- **Démarrage hors-ligne** : si l'enrôlement échoue au lancement mais qu'une
  politique a déjà été mise en cache, l'agent démarre en **mode hors-ligne** et
  applique la **dernière politique connue** (blocages d'apps, filtrage, coucher,
  limites) au lieu de s'arrêter. Il retente la connexion à chaque cycle et se
  resynchronise dès que le serveur répond.
- **Compteur de temps d'écran anti-triche** : l'usage du jour est **persisté sur
  disque** (`state.json`, écriture atomique). **Redémarrer le PC ne remet plus le
  compteur à zéro** — l'enfant ne peut plus regagner du temps en rebootant. Le
  compteur repart à zéro **uniquement** au changement de jour local (minuit).
- **Aucune télémétrie perdue** : les mesures d'usage et d'événements non encore
  synchronisées sont conservées (en mémoire **et** sur disque) puis **rejouées**
  après un échec réseau ou un crash — le temps d'écran n'est jamais sous-compté.
- **Requêtes bornées** : les appels réseau ont un **délai maximal** (timeout) —
  un serveur qui accepte la connexion sans répondre ne peut plus figer l'agent.
- **Anti-triche horloge** (`lib/clock.js`) : l'application des règles (coucher,
  limites, changement de jour) utilise une **horloge de confiance** ancrée sur
  l'heure du serveur + le temps **monotone** — **modifier l'heure système ne
  déplace ni le coucher ni la limite** et ne réinitialise pas le compteur du
  jour ; l'heure de confiance ne peut jamais **reculer** (même après reboot). Un
  décalage important entre l'horloge locale et le serveur **alerte le parent**.
- **Politique signée (inviolable)** (`lib/policy-verify.js`) : le serveur signe
  la politique effective avec une clé **Ed25519** ; l'agent **épingle la clé
  publique** et **vérifie la signature** avant d'appliquer une politique — y
  compris celle chargée du cache disque au démarrage hors-ligne. **Modifier
  `state.json` pour assouplir les règles casse la signature** → l'agent bascule
  sur un **verrouillage de sécurité** (tout en pause) au lieu de faire confiance
  au cache altéré. Un horodatage signé (`iat`) bloque le **rejeu** d'une ancienne
  politique plus permissive.

**Emplacement des données** : les fichiers **inscriptibles au runtime** (config,
`heartbeat.json`, `state.json`, staging des mises à jour) sont stockés dans
**`%ProgramData%\Kidora`** (`lib/paths.js`) — inscriptible par le **compte enfant
standard**, alors que les **scripts** restent verrouillés en lecture seule dans
le dossier d'installation. C'est le modèle Windows classique (code en lecture
seule, données inscriptibles) : sans cela, sous les ACL d'auto-protection,
l'agent ne pourrait pas écrire son propre état. `SYSTEM`/Administrateurs gardent
le contrôle total (le gardien peut lire/remplacer). L'installateur crée ce
dossier et migre une config existante lors d'une mise à jour. Repli sur le
dossier de l'agent si `%ProgramData%` est indisponible (aucune régression).

## Notes

- L'agent applique la politique en temps réel (échantillon 5 s) et synchronise la
  télémétrie toutes les 30 s par défaut.
