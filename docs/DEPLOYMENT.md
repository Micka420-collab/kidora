# Déploiement Kidora

## Local (développement)

```bash
cd apps/server
npm install
npx prisma migrate dev
npm run seed
npm run dev   # http://localhost:3000
```

## Production sur Vercel + Postgres

Le serveur Next.js est prêt pour Vercel. SQLite ne persiste pas en serverless :
passez à **PostgreSQL** (Neon, via le Vercel Marketplace).

> **Aucun changement de code.** Le choix de la base est **automatique** d'après
> `DATABASE_URL` :
> - `file:…` → SQLite (driver `better-sqlite3`) — défaut dev.
> - `postgres://` / `postgresql://` → PostgreSQL (driver `pg`).
>
> `src/lib/prisma.ts` sélectionne l'adaptateur au runtime, et le script
> `scripts/select-db-provider.mjs` (lancé par `postinstall` / `prebuild`) aligne
> le `provider` du schéma Prisma sur la cible **avant** `prisma generate` (le
> dialecte SQL est figé à la génération et `provider` ne peut pas être un `env()`).

### 1. Provisionner la base

- Vercel → *Storage* → **Neon Postgres** (ou `npx create-db`).
- Récupérez `DATABASE_URL` (ajoutez `?sslmode=require` si nécessaire).

### 2. Variables d'environnement (Vercel → Settings → Environment Variables)

| Clé | Valeur | Portée |
|---|---|---|
| `DATABASE_URL` | chaîne Postgres | **Build + Runtime** |
| `AUTH_SECRET` | secret aléatoire (48+ octets) | Runtime |
| `DATABASE_PROVIDER` | *(optionnel)* `postgresql` pour forcer le dialecte au build si `DATABASE_URL` n'est pas dispo au build | Build |

> `DATABASE_URL` doit être présente **au build** : `prebuild` génère le client
> Prisma pour le bon dialecte. Sur Vercel les variables d'env sont dispo au build
> par défaut. Sinon, posez `DATABASE_PROVIDER=postgresql` (override explicite).

### 3. Provisionner le schéma sur Postgres

Les migrations du dépôt sont en dialecte **SQLite** ; pour Postgres on synchronise
le schéma via `db push` (pas d'historique de migration) :

```bash
cd apps/server
DATABASE_URL="postgresql://…" npm run db:push    # crée les tables sur Postgres
DATABASE_URL="postgresql://…" npm run seed        # (optionnel) compte démo
```

> `db:push` = `select-db-provider` (→ postgresql) + `prisma db push`. Pour un
> historique de migrations Postgres dédié, générer un baseline avec
> `prisma migrate diff` contre la base cible (amélioration future).

### 4. Déployer

```bash
cd apps/server
vercel deploy --prod
```

> `vercel` CLI : `npm i -g vercel`. Build : `next build` (Turbopack, vérifié OK).
> Le `prebuild` régénère le client Prisma pour Postgres à partir de `DATABASE_URL`.

## Agent Windows en production

Pointez l'agent sur l'URL déployée :

```powershell
node agent.js --token <JETON> --server https://kidora.exemple.com
# démarrage auto :
powershell -File install-agent.ps1 -Token <JETON> -Server https://kidora.exemple.com
```

## App mobile

```bash
cd apps/mobile
eas build --platform android   # dev build natif (modules enforcement)
```

Configurez `extra.defaultServer` dans `app.json` sur l'URL de production.
