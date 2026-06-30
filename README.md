<div align="center">

<img src="assets/kidora-logo.svg" alt="Kidora" width="380" />

### 🛡️ Contrôle parental multi-plateforme, bienveillant et complet

**Temps d'écran · Filtrage web · Contrôle des apps · Localisation · SOS · Alertes**
Windows · Android · iPhone, pilotés depuis un tableau de bord unique.

<sub>Un <b>bouclier</b> qui abrite un <b>cœur</b> — protéger sans surveiller à l'excès.</sub>

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-7-2d3748?logo=prisma)
[![CI](https://github.com/Micka420-collab/kidora/actions/workflows/ci.yml/badge.svg)](https://github.com/Micka420-collab/kidora/actions/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-231%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

</div>

---

## 🎨 Page d'accueil

Une **landing animée** accueille les visiteurs non connectés : défilement avec **parallaxe et profondeur 3D**, hero qui s'incline vers le curseur, illustrations générées et **scrollytelling** présentant chaque pilier, compteurs animés, FAQ — le tout respectueux de `prefers-reduced-motion`. Les comptes déjà connectés sont redirigés vers le tableau de bord.

<div align="center">
<img src="apps/server/public/hero.jpg" alt="Page d'accueil Kidora" width="760" />
</div>

## ✨ Fonctionnalités

| Domaine | Détail |
|---|---|
| ⏱️ **Temps d'écran** | Limites quotidiennes par jour, heures du coucher, **pause instantanée** (par enfant ou familiale), **temps bonus** (demandes de l'enfant + octroi parental) |
| 🗓️ **Routines** | Profils horaires (ex. heures d'école) qui bloquent automatiquement certaines apps |
| 🌐 **Filtrage web** | Blocage par **catégorie** (adulte, jeux d'argent, violence, drogues, rencontres…), SafeSearch forcé, listes blanche/noire |
| 🎮 **Applications** | Autoriser / bloquer / **limiter** chaque app, détection des nouvelles apps |
| 🔍 **Mots-clés sensibles** | Alerte si des termes à risque (automutilation, violence…) ou personnalisés apparaissent dans les recherches |
| 🛡️ **Détection de risque (IA)** | Analyse des **messages** & recherches : score de risque pondéré détectant **grooming/prédation**, automutilation, harcèlement → alertes par sévérité |
| ▶️ **Vidéos & Messages** | **Vidéos YouTube** regardées (PC + téléphone, avec miniatures) et **SMS** reçus/envoyés, avec **export CSV** |
| 🌐 **Historique de navigation** | Derniers sites visités par enfant (catégorie, blocages signalés, export CSV) |
| 📍 **Localisation** | Position temps réel, historique, **zones de sécurité (géofences)** avec alertes entrée/sortie |
| 📊 **Rapports** | Usage par app / catégorie, tendance, **export CSV**, période mémorisée |
| 📸 **Captures d'écran** | À la demande (Windows), **chiffrées au repos** (AES-256-GCM) |
| 🎮 **Actions à distance** | Verrouiller un appareil, envoyer un message |
| 👨‍👩‍👧 **Multi-tuteurs** | Inviter un co-parent (accès partagé, révocable) |
| 🔔 **Notifications** | **Web push** pour les alertes critiques |
| 🔐 **Sécurité & RGPD** | JWT httpOnly, bcrypt, **2FA/TOTP**, rate-limiting, **CSP** + en-têtes durcis, **force de mot de passe + détection de fuite (HIBP)**, journal d'audit, export & suppression de compte |
| 🌍 **Bilingue** | Interface FR / EN |

## 🏗️ Architecture

```
kidora/
├── apps/
│   ├── server/          # Next.js 16 — dashboard parent + API REST (Prisma/SQLite→Postgres)
│   ├── agent-windows/   # Agent Node.js — surveillance & application des règles (Windows)
│   └── mobile/          # App Expo/React Native — compagnon parent + agent enfant
└── docs/                # Architecture, API, déploiement, roadmap
```

```
   Appareil enfant                      Serveur Kidora                 Parent
 ┌──────────────────┐   télémétrie    ┌─────────────────┐           ┌──────────┐
 │  Agent Windows   │ ─────────────▶  │   API /agent/*  │           │ Dashboard│
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
ouvrez-le. Android 6.0+ (minSdk 23).

### 🪟 Agent Windows (MSI)

Installeur signé `kidora-agent.msi` dans les **[Releases](https://github.com/Micka420-collab/kidora/releases)**
(tag `agent-v*`). Installation silencieuse :

```powershell
msiexec /i kidora-agent.msi /qn TOKEN=<jeton> SERVER=https://votre-serveur CHILDUSER="PC\Enfant"
```

## ⚙️ Configuration requise

| Composant | Minimum |
|---|---|
| **Serveur / dashboard** | Linux · macOS · Windows · **Node.js 20+** · ~300 Mo disque · navigateur moderne (Chrome 111+, Edge, Firefox, Safari 16.4+) |
| **Agent Windows** | Windows 10/11 · Node.js 18+ · PowerShell (inclus) |
| **App Android** | Android **6.0+** (minSdk 23) — *Kidora Parents* et *Kidora Kids* |
| **App iOS** | iOS 15.1+ (build EAS, entitlement Screen Time) |
| **Production** | PostgreSQL (Neon) recommandé pour le déploiement (Vercel) |

## 🚀 Démarrage rapide

### 🐧 Linux / Ubuntu — en une commande
```bash
git clone https://github.com/Micka420-collab/kidora.git && cd kidora
bash install.sh          # installe Node (si besoin), prépare la base, build & démarre
# développement :  bash install.sh --dev
```
→ <http://localhost:3000> — **démo : `demo@kidora.app` / `kidora1234`**

### 1. Serveur + dashboard (manuel, toutes plateformes)
```bash
cd apps/server
npm install
npx prisma migrate dev      # crée la base SQLite
npm run seed                # données de démo
npm run dev                 # http://localhost:3000
```
**Démo :** `demo@kidora.app` / `kidora1234`

### 2. Agent Windows (sur le PC enfant)
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
npm test          # 171 tests unitaires (Vitest)
npm run build     # build de production (Turbopack)
```

## 🧱 Stack
**Next.js 16** (App Router, Turbopack) · **React 19** · **Tailwind CSS v4** · **Prisma 7** (SQLite → PostgreSQL) · **jose** + **bcryptjs** · **web-push** · Agent : **Node.js + PowerShell** (zéro dépendance native) · Mobile : **Expo / React Native**.

## 📦 Déploiement

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMicka420-collab%2Fkidora&root-directory=apps/server&env=DATABASE_URL,AUTH_SECRET,DATA_ENC_KEY&envDescription=URL%20Postgres%20(Neon)%2C%20secret%20JWT%20al%C3%A9atoire%2C%20cl%C3%A9%20de%20chiffrement&envLink=https%3A%2F%2Fgithub.com%2FMicka420-collab%2Fkidora%2Fblob%2Fmain%2Fdocs%2FDEPLOYMENT.md&project-name=kidora&repository-name=kidora)

Déploiement **un clic** sur Vercel : le dossier racine `apps/server` est pré-réglé,
le schéma Postgres (Neon) est créé automatiquement au build (`vercel-build` →
`prisma db push`). Renseignez `DATABASE_URL` + `AUTH_SECRET` et c'est en ligne.
Détails & import manuel : [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## 📚 Documentation
- [Architecture](docs/ARCHITECTURE.md) · [API](docs/API.md) · [Déploiement](docs/DEPLOYMENT.md) · [Roadmap](docs/ROADMAP.md)

## ⚖️ Usage légal
Kidora est destiné au **contrôle parental d'enfants mineurs par leurs représentants légaux**.
Informez les utilisateurs des appareils lorsque la loi l'exige. N'utilisez pas ce logiciel
pour surveiller des adultes sans consentement.

## 📄 Licence
[MIT](LICENSE)

<div align="center"><sub>Conçu pour les familles. 🛡️</sub></div>
