<div align="center">

<img src="https://raw.githubusercontent.com/Micka420-collab/kidora/main/assets/kidora-logo.png" alt="Kidora" width="380" />

### 🛡️ Contrôle parental multi-plateforme, bienveillant et complet

**Temps d'écran · Filtrage web · Contrôle des apps · Localisation · SOS · Alertes**
Windows · Linux · Android · iPhone, pilotés depuis un tableau de bord unique.

<sub>Un <b>bouclier</b> qui abrite un <b>cœur</b> — protéger sans surveiller à l'excès.</sub>

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-7-2d3748?logo=prisma)
[![CI](https://github.com/Micka420-collab/kidora/actions/workflows/ci.yml/badge.svg)](https://github.com/Micka420-collab/kidora/actions/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-577%20passing-brightgreen)
![Expo SDK](https://img.shields.io/badge/Expo-SDK%2052-000020?logo=expo)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

</div>

---

## 🎨 Page d'accueil

Une **landing animée** accueille les visiteurs non connectés : défilement avec **parallaxe et profondeur 3D**, hero qui s'incline vers le curseur, illustrations générées et **scrollytelling** présentant chaque pilier, compteurs animés, FAQ — le tout respectueux de `prefers-reduced-motion`. Les comptes déjà connectés sont redirigés vers le tableau de bord.

<div align="center">
<img src="https://raw.githubusercontent.com/Micka420-collab/kidora/main/apps/server/public/hero.jpg" alt="Page d'accueil Kidora" width="760" />
</div>

## 🖼️ Aperçu

<table>
  <tr>
    <td align="center" width="33%">
      <img src="https://raw.githubusercontent.com/Micka420-collab/kidora/main/apps/server/public/show-screentime.jpg" alt="Temps d'écran & coucher" width="280" /><br/>
      <b>⏱️ Temps d'écran & coucher</b>
    </td>
    <td align="center" width="33%">
      <img src="https://raw.githubusercontent.com/Micka420-collab/kidora/main/apps/server/public/show-location.jpg" alt="Localisation & zones de sécurité" width="280" /><br/>
      <b>📍 Localisation & zones</b>
    </td>
    <td align="center" width="33%">
      <img src="https://raw.githubusercontent.com/Micka420-collab/kidora/main/apps/server/public/show-filter.jpg" alt="Filtrage web par catégorie" width="280" /><br/>
      <b>🌐 Filtrage web</b>
    </td>
  </tr>
</table>

<div align="center">
<img src="https://raw.githubusercontent.com/Micka420-collab/kidora/main/apps/server/public/dashboard.jpg" alt="Tableau de bord & app mobile" width="720" /><br/>
<sub>Un tableau de bord web unique + apps mobiles, synchronisés en temps réel.</sub>
</div>

## ✨ Fonctionnalités

| Domaine | Détail |
|---|---|
| ⏱️ **Temps d'écran** | Limites quotidiennes par jour, heures du coucher, **pause instantanée ou programmée** (30 min/1 h/2 h, reprise auto — par enfant ou familiale), **temps bonus** (demandes de l'enfant + octroi parental) |
| 🗓️ **Routines** | Profils horaires (ex. heures d'école) qui bloquent automatiquement certaines apps |
| 🌐 **Filtrage web** | Blocage par **catégorie** (adulte, jeux d'argent, violence, drogues, rencontres…), SafeSearch forcé, listes blanche/noire |
| 🎮 **Applications** | Autoriser / bloquer / **limiter** chaque app (y compris les **apps du Microsoft Store / UWP**), **usage du jour vs limite**, détection des nouvelles apps |
| 🔍 **Mots-clés sensibles** | Alerte si des termes à risque (automutilation, violence…) ou personnalisés apparaissent dans les recherches |
| 🛡️ **Détection de risque (IA)** | Analyse des **messages** & recherches : score de risque pondéré détectant **grooming/prédation**, automutilation, harcèlement → alertes par sévérité. **LLM optionnel** : branchez votre **clé OpenRouter** et choisissez le modèle (DeepSeek, GPT-4o-mini…) avec **comparaison des prix** ; repli automatique sur l'heuristique |
| ▶️ **Vidéos & Messages** | **Vidéos YouTube** regardées (PC + téléphone, avec miniatures) et **SMS** reçus/envoyés, avec **export CSV** |
| 🌐 **Historique de navigation** | Derniers sites visités par enfant (catégorie, blocages signalés, export CSV) |
| 📍 **Localisation** | Position temps réel, historique, **zones de sécurité (géofences)** avec alertes entrée/sortie |
| 📊 **Rapports & insights** | Usage par app / catégorie, tendance, **delta vs période précédente**, **activité par heure**, **insights hebdo** (vue d'ensemble), **export CSV**, période mémorisée |
| 📸 **Captures d'écran** | À la demande (Windows), **chiffrées au repos** (AES-256-GCM) |
| 🎮 **Actions à distance** | Verrouiller, localiser, capture d'écran, envoyer un message (**web & mobile**) |
| 👨‍👩‍👧 **Multi-tuteurs** | Inviter un co-parent (accès partagé, révocable) |
| 🔔 **Notifications** | **Web push** + **préférences par type d'alerte** (sécurité toujours active) + **alerte « appareil hors-ligne »** (anti-tamper) |
| 📴 **Résilience hors-ligne** | L'agent continue d'appliquer la **dernière politique signée** sans connexion, l'app enfant met les **SOS en file d'attente**, le dashboard reste consultable (service worker) |
| 🔐 **Sécurité & comptes** | JWT httpOnly, bcrypt, **2FA/TOTP + codes de secours**, secret TOTP **chiffré au repos**, **révocation de session** (déconnexion globale), **mot de passe oublié / réinitialisation**, **vérification d'email**, changement mdp/email **ré-authentifié**, **anti-brute-force**, rate-limiting, **CSP** + en-têtes durcis, **force de mot de passe + fuite (HIBP)**, journal d'audit |
| ♻️ **RGPD & rétention** | Export & suppression de compte, **nettoyage automatique** des données (rétention configurable) |
| 🌍 **Bilingue** | Interface FR / EN |

## 📱 Application parent (mobile)

L'app **Kidora Parents** (Expo / React Native) offre désormais une **parité quasi
complète avec le tableau de bord web** — pilotez tout depuis le téléphone :

| Domaine | Sur mobile |
|---|---|
| 👀 **Suivi enfant** | Vue d'ensemble temps réel, **historique de navigation web**, **activité par heure** + évènements, **vidéos YouTube**, **messages**, **localisation** (historique + zones), **appareils** (batterie / en ligne) |
| ⏱️ **Temps d'écran** | **Édition des limites quotidiennes** par jour, pause instantanée/programmée (par enfant **ou familiale**), **temps bonus** & réponse aux demandes |
| 🎮 **Applications** | **Autoriser / limiter / bloquer** chaque app + limite quotidienne |
| 🌐 **Filtrage web** | **Catégories bloquées**, SafeSearch, blocage des sites inconnus |
| 🔍 **Mots-clés** | **Ajout / suppression** des termes sensibles surveillés |
| 🗓️ **Routines** | Activer / désactiver / supprimer les profils horaires |
| 📍 **Zones de sécurité** | **Créer une géofence à la position actuelle** + suppression |
| 🎮 **Actions à distance** | Verrouiller, localiser, message, captures |
| 🔐 **Compte** | **2FA/TOTP**, changement mot de passe / email, **préférences de notification** |

> L'app **Kidora Kids** (même binaire mobile) gère l'appareil enfant : localisation, usage, **SOS**,
> et le **blocage d'apps natif Android** (AccessibilityService — build EAS).

## 🏗️ Architecture

```
kidora/
├── apps/
│   ├── server/          # Next.js 16 — dashboard parent + API REST (Prisma/SQLite→Postgres)
│   ├── agent-windows/   # Agent Node.js — surveillance & application des règles (Windows & Linux)
│   └── mobile/          # App Expo/React Native — compagnon parent + agent enfant
└── docs/                # Architecture, API, déploiement, roadmap
```

```
   Appareil enfant                      Serveur Kidora                 Parent
 ┌──────────────────┐   télémétrie    ┌─────────────────┐           ┌──────────┐
 │  Agent Win/Linux │ ─────────────▶  │   API /agent/*  │           │ Dashboard│
 │  / app mobile    │ ◀─────────────  │  policy engine  │ ◀───────▶ │   web    │
 └──────────────────┘   policy+cmds   └─────────────────┘   REST    └──────────┘
```

Le serveur calcule une **politique effective** par enfant (règles d'apps, domaines
bloqués, filtres, temps d'écran, routines actives, bonus). Chaque appareil la récupère
et l'applique localement, en remontant l'usage et les événements.

## 📥 Téléchargement

Depuis GitHub : <https://github.com/Micka420-collab/kidora>

```bash
# Cloner le dépôt
git clone https://github.com/Micka420-collab/kidora.git
cd kidora
```

Ou téléchargez une archive depuis l'onglet **Releases** (ZIP / tar.gz), ou
**Code → Download ZIP**.

### 📱 Applications Android (APK)

Deux apps distinctes (à installer en sideload sur le téléphone) :

| App | Rôle | APK |
|---|---|---|
| **Kidora Parents** | Suivi & gestion depuis le téléphone parent | onglet **[Releases](https://github.com/Micka420-collab/kidora/releases)** (`mobile-v*`) |
| **Kidora Kids** | Appareil enfant : localisation, usage, **SOS** | onglet **[Releases](https://github.com/Micka420-collab/kidora/releases)** (`mobile-v*`) |

**Installer un APK** : sur le téléphone, autorisez « Installer des applications
inconnues » pour votre navigateur, téléchargez l'APK depuis la Release puis
ouvrez-le. Android 7.0+ (minSdk 24).

### 🪟 Agent Windows

Deux options sur le PC enfant :

- **Un clic** : double-cliquez `apps/agent-windows/Installer-Kidora.cmd` (auto-élévation,
  installe Node via winget si besoin, colle le jeton ou lit un deep-link `kidorachild://`).
- **MSI** : installeur signé `kidora-agent.msi` dans les
  **[Releases](https://github.com/Micka420-collab/kidora/releases)** (tag `agent-v*`).
  Installation silencieuse :

```powershell
msiexec /i kidora-agent.msi /qn TOKEN=<jeton> SERVER=https://votre-serveur CHILDUSER="PC\Enfant"
```

### 🐧 Agent Linux

Même agent, support natif (détection d'apps, blocage, DNS, batterie) :

```bash
cd apps/agent-windows
bash install-linux.sh    # installe un service systemd (session utilisateur)
```

## ⚙️ Configuration requise

| Composant | Minimum |
|---|---|
| **Serveur / dashboard** | Linux · macOS · Windows · **Node.js 20+** · ~300 Mo disque · navigateur moderne (Chrome 111+, Edge, Firefox, Safari 16.4+) |
| **Agent (PC enfant)** | Windows 10/11 (PowerShell inclus) **ou Linux** (systemd) · Node.js 18+ |
| **App Android** | Android **7.0+** (minSdk 24) — *Kidora Parents* et *Kidora Kids* |
| **App iOS** | iOS 15.1+ (build EAS, entitlement Screen Time) |
| **Production** | PostgreSQL (Neon) recommandé pour le déploiement (Vercel) |

## 🚀 Démarrage rapide

### 🐧 Linux / Ubuntu — en une commande
```bash
git clone https://github.com/Micka420-collab/kidora.git && cd kidora
bash install.sh          # installe Node (si besoin), prépare la base, build & démarre
# développement :  bash install.sh --dev   ·   jeu de données de démo :  bash install.sh --demo
```
→ <http://localhost:3000> — créez votre compte sur `/register` (**aucun compte par défaut**).
Avec `--demo` : `demo@kidora.app` / `kidora1234` (évaluation uniquement).

### 1. Serveur + dashboard (manuel, toutes plateformes)
```bash
cd apps/server
npm install
npx prisma migrate dev      # crée la base SQLite
npm run seed                # données de démo
npm run dev                 # http://localhost:3000
```
**Démo :** `demo@kidora.app` / `kidora1234`

### 2. Agent (sur le PC enfant — Windows ou Linux)
```bash
cd apps/agent-windows
node agent.js --token <JETON> --server http://localhost:3000        # surveillance + application
node agent.js --token <JETON> --server http://localhost:3000 --dry-run   # mode test (sans blocage réel)
```
Le jeton s'obtient dans le dashboard : *enfant → Appareils → Ajouter un appareil*.

### 3. App mobile
```bash
cd apps/mobile
npm install
npx expo start              # Expo Go (compagnon + localisation) ; EAS pour l'enforcement natif
```

## 🧪 Qualité
```bash
cd apps/server
npm test          # 469 tests (Vitest, dont tests d'intégration du moteur de politique)
npm run build     # build de production (Turbopack)

cd ../agent-windows
npm test          # 108 tests (node:test — tracker, horloge de confiance, enforcement, DNS…)

cd ../mobile
npm test          # 26 tests (jest-expo — schedule, thème, file SOS)
```

**577 tests** au total, rejoués en CI sur chaque PR (jobs serveur + mobile). Chaque
correctif de sécurité arrive avec son test de régression : idempotence des crons,
révocation de session, horloge anti-triche, fail-closed du chiffrement, filtrage
web… (voir [`CHANGELOG.md`](CHANGELOG.md)).

## 🧱 Stack
**Next.js 16** (App Router, Turbopack) · **React 19** · **Tailwind CSS v4** · **Prisma 7** (SQLite → PostgreSQL) · **jose** + **bcryptjs** · **web-push** · Agent : **Node.js**, zéro dépendance native (PowerShell sous Windows, outils système sous Linux) · Mobile : **Expo SDK 52 / React Native 0.76** (+ modules natifs Android : UsageStats, AccessibilityService).

## 📦 Déploiement

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMicka420-collab%2Fkidora&root-directory=apps/server&env=DATABASE_URL,AUTH_SECRET,DATA_ENC_KEY&envDescription=URL%20Postgres%20(Neon)%2C%20secret%20JWT%20al%C3%A9atoire%2C%20cl%C3%A9%20de%20chiffrement&envLink=https%3A%2F%2Fgithub.com%2FMicka420-collab%2Fkidora%2Fblob%2Fmain%2Fdocs%2FDEPLOYMENT.md&project-name=kidora&repository-name=kidora)

Déploiement **un clic** sur Vercel : le dossier racine `apps/server` est pré-réglé,
le schéma Postgres (Neon) est créé automatiquement au build (`vercel-build` →
`prisma db push`). Renseignez `DATABASE_URL` + `AUTH_SECRET` et c'est en ligne.

**Auto-hébergement Docker** : `cp .env.docker.example .env` puis `docker compose up -d`
(serveur + PostgreSQL). Détails & import manuel : [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## 📚 Documentation
- [Architecture](docs/ARCHITECTURE.md) · [API](docs/API.md) · [Déploiement](docs/DEPLOYMENT.md) · [Roadmap](docs/ROADMAP.md) · [Changelog](CHANGELOG.md)
- Contribuer : [CONTRIBUTING](CONTRIBUTING.md) · Sécurité : [SECURITY](SECURITY.md)

## ⚖️ Usage légal
Kidora est destiné au **contrôle parental d'enfants mineurs par leurs représentants légaux**.
Informez les utilisateurs des appareils lorsque la loi l'exige. N'utilisez pas ce logiciel
pour surveiller des adultes sans consentement.

## 📄 Licence
[MIT](LICENSE)

<div align="center"><sub>Conçu pour les familles. 🛡️</sub></div>
