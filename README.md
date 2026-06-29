<div align="center">

# 🛡️ Kidora

### Contrôle parental multi-plateforme — aussi complet que Qustodio

Temps d'écran · Filtrage web · Contrôle des applications · Localisation · Alertes
**Windows · Android · iPhone**, pilotés depuis un tableau de bord unique.

</div>

---

## ✨ Fonctionnalités

| Domaine | Détail |
|---|---|
| ⏱️ **Temps d'écran** | Limites quotidiennes par jour de la semaine, heures du coucher, pause instantanée |
| 🌐 **Filtrage web** | Blocage par catégorie (adulte, jeux d'argent, violence…), SafeSearch forcé, listes blanche/noire |
| 🎮 **Applications** | Autoriser / bloquer / limiter chaque app, détection des nouvelles apps |
| 📍 **Localisation** | Position en temps réel, historique, zones de sécurité (géofences) avec alertes entrée/sortie |
| 🔔 **Alertes** | Tentatives bloquées, limites atteintes, nouvelles apps, géofences |
| 📊 **Rapports** | Usage par app et par catégorie, tendance sur 7 jours, timeline d'activité |
| 🖥️ **Multi-appareils** | Un tableau de bord, tous les appareils de la famille |

## 🏗️ Architecture

```
kidora/
├── apps/
│   ├── server/          # Next.js 16 — dashboard parent + API REST (Prisma/SQLite)
│   ├── agent-windows/   # Agent Node.js — surveillance & application des règles (Windows)
│   └── mobile/          # App Expo/React Native — compagnon parent + agent enfant
└── docs/                # Architecture & schéma de l'API
```

```
   Appareil enfant                      Serveur Kidora                 Parent
 ┌──────────────────┐   télémétrie    ┌─────────────────┐           ┌──────────┐
 │  Agent Windows   │ ─────────────▶  │   API /agent/*  │           │ Dashboard│
 │  (ou app mobile) │ ◀─────────────  │  policy engine  │ ◀───────▶ │   web    │
 └──────────────────┘   policy+cmds   └─────────────────┘   REST    └──────────┘
```

Le serveur calcule une **politique effective** par enfant (règles d'apps, domaines
bloqués, filtres, temps d'écran). Chaque appareil la récupère et l'applique
localement, en remontant l'usage et les événements.

## 🚀 Démarrage rapide

### 1. Serveur + dashboard

```bash
cd apps/server
npm install
npx prisma migrate dev      # crée la base SQLite
npm run seed                # données de démo
npm run dev                 # http://localhost:3000
```

Connexion démo : **demo@kidora.app** / **kidora1234**

### 2. Agent Windows (sur le PC enfant)

```bash
cd apps/agent-windows
node agent.js --token <JETON> --server http://localhost:3000
# mode test sans blocage réel :
node agent.js --token <JETON> --server http://localhost:3000 --dry-run
```

Le jeton s'obtient dans le dashboard : *enfant → Appareils → Ajouter un appareil*.

### 3. App mobile (compagnon / agent enfant)

```bash
cd apps/mobile
npm install
npx expo start
```

## 🧱 Stack technique

- **Next.js 16** (App Router, Turbopack) · **React 19** · **Tailwind CSS v4**
- **Prisma 7** + SQLite (dev) → PostgreSQL/Neon (prod)
- **Auth** JWT (cookie httpOnly), **jose** + **bcryptjs**
- **Agent** Node.js pur + PowerShell (zéro dépendance native)
- **Mobile** Expo / React Native

## 📦 Déploiement (production)

Le serveur est prêt pour **Vercel** : remplacez le provider Prisma par `postgresql`
(Neon via le Vercel Marketplace), définissez `DATABASE_URL` et `AUTH_SECRET`, puis
`vercel deploy`. Voir `docs/DEPLOYMENT.md`.

## ⚖️ Usage légal

Kidora est destiné au **contrôle parental d'enfants mineurs par leurs représentants
légaux**. Informez les utilisateurs des appareils de la surveillance lorsque la loi
l'exige. N'utilisez pas ce logiciel pour surveiller des adultes sans consentement.

## 📄 Licence

MIT — voir [LICENSE](./LICENSE).
