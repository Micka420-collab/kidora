# Architecture Kidora

## Vue d'ensemble

Kidora suit un modèle **agent ↔ serveur ↔ dashboard** :

- Le **serveur** est la source de vérité. Il stocke comptes, enfants, appareils,
  règles et télémétrie, et calcule une **politique effective** par enfant.
- Chaque **agent** (Windows, mobile) s'authentifie avec un *jeton d'enrôlement*,
  récupère la politique, l'applique localement, et remonte l'usage + les événements.
- Le **dashboard** (web, même app Next.js) permet aux parents de tout configurer.

```
                          ┌───────────────────────────┐
                          │        Serveur Kidora       │
   Agent Windows ───────▶ │  Next.js 16 (App Router)    │ ◀─────── Dashboard parent
   App mobile    ───────▶ │  ├─ /api/agent/*  (devices) │          (React, même app)
   (enfant)               │  ├─ /api/*        (parents) │ ◀─────── App mobile (parent)
                          │  └─ Prisma → SQLite/Postgres│
                          └───────────────────────────┘
```

## Modèle de données (Prisma)

- **Parent** 1—N **Child** 1—N **Device**
- **Child** possède : `ScreenTimeRule`, `WebFilterConfig`, N×`AppRule`, N×`WebRule`,
  N×`Geofence`.
- Télémétrie : `ActivityEvent`, `AppUsage` (agrégé par jour), `WebVisit`,
  `LocationPing`.
- `Alert` (vers le parent) et `Command` (file vers l'appareil).

Voir [`apps/server/prisma/schema.prisma`](../apps/server/prisma/schema.prisma).

## Le moteur de politique

`buildPolicy(childId)` ([`lib/policy.ts`](../apps/server/src/lib/policy.ts)) agrège
les règles d'un enfant en un objet JSON unique que l'agent applique :

```jsonc
{
  "paused": false,
  "screenTime": { "enabled": true, "dailyLimits": { "mon": 120, ... }, "bedtimes": [...] },
  "webFilter":  { "safeSearch": true, "blockUnknown": false, "blockedCategories": [...] },
  "blockedDomains": ["pornhub.com", ...],   // liste par défaut + règles parent
  "allowedDomains": ["github.com"],          // l'autorisation explicite gagne
  "appRules": [{ "appId": "valorant.exe", "action": "block" }, ...]
}
```

## Boucle de l'agent

1. **Enroll** (`POST /api/agent/enroll`) → reçoit `deviceId`, `policy`, intervalle.
2. **Capteur** (5 s) : application au premier plan + processus → comptabilise l'usage,
   applique la politique en direct (blocage, verrouillage).
3. **Sync** (30 s, `POST /api/agent/sync`) : envoie usage/événements/localisation,
   reçoit la politique fraîche + commandes en attente, les exécute.

## Classification de contenu

[`lib/categories.ts`](../apps/server/src/lib/categories.ts) mappe domaines et apps
vers des catégories (réseaux sociaux, adulte, jeux, etc.) avec des signaux défensifs
pour les catégories sensibles. Sert au filtrage, aux règles et aux rapports.

## Sécurité

- Auth parent : JWT signé (HS256, `jose`) en cookie `httpOnly` (web) ou en-tête
  (mobile). Mots de passe : `bcrypt`.
- Auth appareil : *jeton d'enrôlement* aléatoire (256 bits) en `Authorization: Bearer`.
- Toutes les routes parent vérifient la propriété de l'enfant (`requireOwnedChild`).
