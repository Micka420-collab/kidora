# Contribuer à Kidora

Merci de votre intérêt ! 🛡️

## Mise en route

```bash
cd apps/server
npm install
npx prisma migrate dev
npm run seed
npm run dev          # http://localhost:3000  (demo@kidora.app / kidora1234)
```

## Avant d'ouvrir une PR

Depuis `apps/server` :

```bash
npx tsc --noEmit     # types
npm test             # tests unitaires + intégration (Vitest)
npm run build        # build de production
```

Le **CI GitHub Actions** rejoue ces étapes sur chaque PR — il doit être vert.

## Conventions

- **Commits** : style conventionnel (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `ci:`).
- **TypeScript strict**, pas de `any` non justifié.
- **Jamais de secret commité** (`.env`, jetons, clés VAPID, `*.db` sont gitignorés).
- Toute nouvelle logique serveur testable → ajouter un test.

## Structure

| Dossier | Rôle |
|---|---|
| `apps/server` | Dashboard + API (Next.js, Prisma) |
| `apps/agent-windows` | Agent de surveillance Windows (Node + PowerShell) |
| `apps/mobile` | Apps Expo (Kidora Parents / Kidora Kids) |
| `docs` | Architecture, API, déploiement, roadmap |

## Usage légal

Kidora est destiné au contrôle parental d'enfants mineurs par leurs représentants
légaux. Toute contribution doit respecter cet usage.
