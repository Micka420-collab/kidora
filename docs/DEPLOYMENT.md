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

### 1. Basculer Prisma sur Postgres

Dans `apps/server/prisma/schema.prisma` :

```prisma
datasource db {
  provider = "postgresql"
}
```

Et utilisez l'adaptateur Postgres dans `src/lib/prisma.ts` :

```ts
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
```

(`npm i @prisma/adapter-pg`)

### 2. Provisionner la base

- Vercel → *Storage* → **Neon Postgres** (ou `npx create-db`).
- Récupérez `DATABASE_URL`.

### 3. Variables d'environnement (Vercel → Settings → Environment Variables)

| Clé | Valeur |
|---|---|
| `DATABASE_URL` | chaîne Postgres |
| `AUTH_SECRET` | secret aléatoire (48+ octets) |

### 4. Migrer & déployer

```bash
cd apps/server
npx prisma migrate deploy     # applique les migrations sur Postgres
vercel deploy --prod
```

> `vercel` CLI : `npm i -g vercel`. Build : `next build` (Turbopack, déjà vérifié OK).

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
