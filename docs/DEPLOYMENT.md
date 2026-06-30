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

### Déploiement en un clic

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMicka420-collab%2Fkidora&root-directory=apps/server&env=DATABASE_URL,AUTH_SECRET,DATA_ENC_KEY&envDescription=URL%20Postgres%20(Neon)%2C%20secret%20JWT%20al%C3%A9atoire%2C%20cl%C3%A9%20de%20chiffrement&envLink=https%3A%2F%2Fgithub.com%2FMicka420-collab%2Fkidora%2Fblob%2Fmain%2Fdocs%2FDEPLOYMENT.md&project-name=kidora&repository-name=kidora)

Le bouton clone le dépôt, fixe le **dossier racine** sur `apps/server`, demande les
3 variables d'env, puis déploie. Le `buildCommand` (`npm run vercel-build`)
**crée le schéma Postgres automatiquement** (`prisma db push`) au premier build —
rien d'autre à faire que de provisionner une base et de la coller dans
`DATABASE_URL`.

> **Import manuel** (dépôt existant) : Vercel → *Add New… → Project* → importez
> `kidora` → **Root Directory = `apps/server`** → ajoutez les variables d'env → Deploy.

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

### 3. Schéma Postgres — automatique

Le `buildCommand` de `vercel.json` est `npm run vercel-build`
(`scripts/vercel-build.mjs`) : à **chaque build**, si `DATABASE_URL` est
configurée, Prisma synchronise le schéma sur la base (`prisma db push`,
idempotent) puis l'app est compilée. **Aucune étape manuelle** — il suffit que
`DATABASE_URL` soit présente au build (cas par défaut sur Vercel).

> **Robustesse** : si `DATABASE_URL` **n'est pas** définie, le build **n'échoue
> plus** — il **saute** `db:push` (avec un avertissement clair dans les logs) et
> déploie quand même le site. Les pages liées à la base échoueront à l'exécution,
> mais vous obtenez un déploiement (et un message d'erreur explicite) au lieu
> d'un **404 `NOT_FOUND` opaque** dû à un build planté. Si `DATABASE_URL` **est**
> définie mais que le push échoue (identifiants/réseau), le build échoue
> volontairement — c'est une vraie erreur à corriger.

Compte démo (optionnel, une fois) :

```bash
cd apps/server && DATABASE_URL="postgresql://…" npm run seed
```

> Les migrations du dépôt sont en dialecte SQLite ; en prod on utilise `db push`
> (pas d'historique de migration). Pour un baseline de migrations Postgres dédié :
> `prisma migrate diff` contre la base cible (amélioration future).

### 4. Déployer

Via le **bouton** ci-dessus, l'**import** Vercel (Git intégré : chaque push
redéploie), ou la CLI :

```bash
cd apps/server
vercel deploy --prod          # npm i -g vercel ; root = apps/server
```

### Dépannage — l'URL `*.vercel.app` renvoie `404: NOT_FOUND`

Un **404 `NOT_FOUND` servi par `Server: Vercel`** (en-tête `X-Vercel-Error: NOT_FOUND`)
n'est **pas** le 404 de l'app : le nom de domaine **ne pointe vers aucun
déploiement**. Causes habituelles et correctifs :

1. **Aucun déploiement *production* réussi.** Le domaine de prod n'est attribué
   qu'au dernier déploiement **production** (les previews ont des URLs
   `*-git-<branche>` / `*-<hash>`). Vérifiez *Deployments* : s'ils sont tous en
   **Error**, ouvrez les **Build Logs**.
2. **`No Next.js version detected`** dans les logs → **Root Directory** mal réglé.
   *Settings → General → Root Directory = `apps/server`*.
3. **`Environment variable not found: DATABASE_URL`** (ou connexion DB refusée) →
   ajoutez `DATABASE_URL` (Postgres joignable) **et** `AUTH_SECRET` dans l'env
   **Production**, puis redéployez. *(Depuis le build robuste, l'absence de
   `DATABASE_URL` ne plante plus le build — mais une URL invalide, si.)*
4. **Mauvaise branche de production.** *Settings → Git → Production Branch = `main`*.
5. **Domaine non attribué.** *Settings → Domains* : vérifiez qu'un domaine est
   bien rattaché à la Production.

> En monorepo, le projet Vercel doit cibler **`apps/server`** (le `package.json`
> contenant Next.js). Le bouton « Deploy » du README pré-règle ce dossier ; un
> import manuel doit le régler à la main.

### Dépannage — l'app redirige vers `vercel.com/sso` (302, page de connexion Vercel)

Si l'URL répond **`302` vers `https://vercel.com/sso-api?...`** (et pose un cookie
`_vercel_sso_nonce`), le déploiement **fonctionne** mais il est **privé** : la
**Protection de Déploiement Vercel** (*Vercel Authentication*) est active, donc
seuls les membres de l'équipe connectés y accèdent — le public est renvoyé vers
la connexion Vercel.

➡️ **Correctif (rend l'app publique) :** *Project → Settings → **Deployment
Protection** → Vercel Authentication* → mettre sur **Disabled** (ou *Only Preview
Deployments* pour ne protéger que les previews). La prod devient alors publique
sur `https://<project>-<team>.vercel.app`.

### Dépannage — un domaine `*.vercel.app` précis tombe en 404 mais un autre marche

Vercel attribue plusieurs domaines `*.vercel.app` ; un **alias auto-généré**
(p. ex. `monprojet-<mot>.vercel.app`) peut avoir été **retiré** (→ 404) alors que
le domaine canonique `monprojet-<team>.vercel.app` fonctionne. Utilisez l'URL
listée dans *Settings → Domains* (rubrique **Production**), ou **ré-ajoutez** le
domaine voulu / **ajoutez un domaine personnalisé** et rattachez-le à la
Production. ⚠️ Vérifiez aussi que le `*.vercel.app` visé **n'appartient pas à un
autre projet** (les noms `*.vercel.app` courts sont uniques globalement).

## Rapports hebdomadaires par email

Chaque semaine, Kidora peut envoyer à chaque parent un résumé d'usage de sa
famille (temps d'écran, top apps, web, alertes). **Opt-out** par parent dans
*Paramètres › Notifications* (champ `Parent.weeklyReportEmail`, activé par défaut).

### 1. Configurer le SMTP (sinon : no-op propre)

| Clé | Exemple |
|---|---|
| `SMTP_HOST` | `smtp.sendgrid.net` |
| `SMTP_PORT` | `587` (ou `465`) |
| `SMTP_SECURE` | `false` (`true` pour 465) |
| `SMTP_USER` / `SMTP_PASS` | identifiants SMTP |
| `MAIL_FROM` | `Kidora <no-reply@kidora.app>` |
| `APP_URL` | `https://kidora.example.com` (lien dans l'email) |

Sans `SMTP_HOST`, l'envoi est désactivé et le cron répond `configured:false`
(il indique tout de même combien de parents *seraient* notifiés).

### 2. Planifier le cron

L'endpoint `GET /api/cron/reports` envoie les emails. `apps/server/vercel.json`
le planifie **chaque lundi 8h** :

```json
{ "crons": [{ "path": "/api/cron/reports", "schedule": "0 8 * * 1" }] }
```

Protégez-le avec `CRON_SECRET` (Vercel Cron envoie automatiquement
`Authorization: Bearer $CRON_SECRET`). Pour un autre hébergeur, planifiez un
simple appel HTTP :

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://kidora.example.com/api/cron/reports
```

Test manuel (sans envoi réel) : `?dryRun=1` — `…/api/cron/reports?dryRun=1&days=7`.
En dev (hors production) l'endpoint est accessible sans secret.

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
