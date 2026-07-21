# Roadmap Kidora

## 🛡️ Suite « clé en main & inviolable » (2026-07-02, run autonome)

Branche `feat/offline-turnkey-suite`. Chaque feature testée + vérifiée, build de
prod vert. Agent : 67 tests ; serveur : 336 tests lib + typecheck/eslint.

- [x] **Anti-triche horloge** (`agent/lib/clock.js`) : horloge de confiance ancrée
  serveur + monotone → changer l'heure système ne contourne plus coucher/limites,
  jamais de recul même après reboot ; alerte `clock_change` (non-mutable).
- [x] **`kidora-agent doctor`** : auto-diagnostic (Node, config, serveur joignable,
  heartbeat, admin, écriture cache, tâches planifiées) — sortie ≠ 0 si bloquant.
- [x] **Politique signée Ed25519** (`policy-sign.ts` / `agent/lib/policy-verify.js`) :
  le serveur signe la policy, l'agent vérifie avant d'appliquer, y compris le cache
  offline ; cache altéré → **verrouillage de sécurité** ; anti-rejeu par `iat`.
- [x] **Installateur ZIP pré-configuré** (`/api/children/:id/agent-package`) : le
  dashboard génère un ZIP avec jeton+URL dans `kidora-config.txt` → le parent
  décompresse, double-clique, **ne tape rien**. ZIP writer maison (`lib/zip.ts`),
  validé openable par Windows Expand-Archive. Bundle agent embarqué au build.
- [x] **Page `/status` + `/api/status`** : liste de contrôle d'installation (DB,
  secrets, VAPID, SMTP, CRON, HTTPS) sans valeur secrète, pour l'auto-hébergeur.
- [x] **Découverte LAN** (`agent/lib/discover.js` + `server/scripts/lan-advertise.mjs`) :
  balise multicast UDP (mDNS-style) → l'installateur trouve le serveur sans saisie ;
  vérifié en direct (annonce → découverte).
- [x] **Auto-update signé** (`agent/lib/updater.js` + `/api/agent/bundle`) : l'agent
  télécharge le bundle **signé**, vérifie signature + hachage, **prépare** ; le
  gardien SYSTEM applique (sauvegarde + **rollback** si pas de heartbeat). Jamais
  de mise à jour non signée. Vérifié bout-en-bout (sign → verify → stage).
- [x] **Correctif packaging** : MSI + bundle serveur embarquent désormais **les 20
  modules runtime** (clock, doctor, policy-verify, discover, updater, store…) —
  un agent installé ne plante plus sur un import manquant.

**Durcissement enchaîné (mêmes run, critiques de l'audit) :**
- [x] **Idempotence du temps d'écran** : un retry après réponse perdue ne
  double-compte plus. L'agent envoie l'usage **cumulatif** du jour et le serveur
  fait un **SET monotone** (au lieu d'incrémenter) ; rétrocompatible dans les deux
  sens. (+2 tests d'intégration, +1 agent).
- [x] **Dashboard hors-ligne** : `OfflineBanner` (hook `useOnline` SSR-safe) +
  `client.ts` avec timeout + retry sûr (GET seulement, jamais les mutations).
- [x] **Ordonnanceur auto-hébergement** : `instrumentation.ts` déclenche les crons
  (rétention, offline-check, rapports) hors Vercel dès qu'un `CRON_SECRET` est
  défini (généré par `install.sh`) ; no-op sur Vercel/Edge. (+7 tests).
- [x] **Sauvegardes DB automatiques** (`/api/cron/backup`) : snapshot SQLite atomique
  (`VACUUM INTO`) + rotation (`BACKUP_KEEP`, def 7) ; no-op sur Postgres ; branché
  sur l'ordonnanceur (quotidien). (+5 tests, `VACUUM INTO` validé via node:sqlite).
- [x] **Redistribution des commandes** : une commande « delivered » non acquittée
  (agent qui crashe / réponse perdue) au-delà d'un délai de grâce
  (`COMMAND_REDELIVER_MINUTES`, def 10) repasse en « pending » → plus jamais perdue.
  (+2 tests d'intégration).
- [x] **Données runtime dans `%ProgramData%\Kidora`** (`lib/paths.js`) : les fichiers
  inscriptibles (config/heartbeat/état/staging) vont dans un dossier accessible au
  **compte enfant standard**, alors que les scripts restent verrouillés — sans quoi
  le cache offline/état/update ne fonctionnait pas sous les ACL d'auto-protection.
  Repli sûr + migration à la mise à jour ; gardien/installeur alignés. (+4 tests).
- [x] **Dédup exact-once des événements** : l'agent estampille chaque événement d'un
  `id` stable (conservé au re-queue) ; le serveur filtre les événements déjà stockés
  → un retry ne crée plus de lignes ni d'alertes en double (sans migration de schéma).
  (+2 tests).
- [x] **Push résilient** : les échecs transitoires (429/5xx/réseau) sont **retentés**
  (3× backoff) au lieu d'être ignorés → une alerte critique (SOS) n'est plus perdue
  sur un simple blip réseau ; abonnements expirés (404/410) purgés. (+3 tests).
- [x] **File SOS hors-ligne (mobile)** : un SOS déclenché sans réseau est **persisté**
  puis **rejoué** au prochain sync réussi (événement `panic` → alerte critique côté
  serveur, dédupliqué par id) ; l'enfant voit « SOS enregistré, envoyé dès que
  possible ». Plus aucun SOS perdu. (+1 test d'intégration).
- [x] **Onboarding mobile complet** : inscription **dans l'app** (`/api/auth/register`),
  **ajout d'un enfant** puis **d'un appareil** (jeton + lien d'appairage) — sans
  passer par le web. + persistance de la policy côté Kids (démarrage à froid correct).
- [x] **Dashboard hors-ligne (service worker)** : SW **network-first** (aucun
  changement en ligne ; `/api` jamais mis en cache) → page hors-ligne soignée au
  lieu de l'écran d'erreur du navigateur ; assets figés en cache-first ; **prod
  uniquement**. Logique vérifiée par `sw.test.ts` (6 tests exécutant le vrai sw.js).
- [x] **Auto-hébergement Docker** : `docker-compose.yml` (serveur + PostgreSQL) +
  `Dockerfile` (openssl pour Prisma) + entrypoint (schéma puis démarrage). Une
  commande. *Marqué non-construit-en-CI* (pas d'environnement Docker ici).

## 🌐 Hors-connexion & installation sans friction (2026-07-02)

- [x] **Agent Windows résilient hors-ligne** : la politique effective est mise en
  **cache sur disque** (`lib/store.js`, écriture atomique). Si l'enrôlement échoue
  au démarrage, l'agent ne quitte plus (`process.exit(1)` supprimé) mais démarre
  en **mode hors-ligne** et applique la **dernière politique connue**, en se
  resynchronisant dès le retour du serveur.
- [x] **Compteur de temps d'écran anti-triche** : `todayByApp` et la file de
  télémétrie non synchronisée sont **persistés** (snapshot du `Tracker`) →
  **redémarrer le PC ne remet plus le compteur à zéro** (il ne se réinitialise
  qu'au changement de jour local) et **aucune mesure d'usage n'est perdue** sur
  crash/coupure. Timeouts réseau (`AbortController`) sur enroll/sync/screenshot —
  un serveur qui « pend » ne fige plus l'agent. **+7 tests** (store + snapshot).
- [x] **Installeur Windows en un clic** (`Installer-Kidora.cmd` → `setup-windows.ps1`) :
  double-clic → auto-élévation admin → **installe Node.js si absent** (winget),
  prépare l'agent, récupère le jeton (collé, **deep-link** `kidorachild://enroll`,
  ou fichier `kidora-config.txt` = zéro saisie), installe l'agent **durci** et le
  **démarre**. Vérifié en `-DryRun`.
- [x] **Correctif critique MSI** : le manifeste WiX (`installer/kidora-agent.wxs`)
  **n'embarquait pas** `lib/scan-apps.js` ni `lib/videos.js`, tous deux importés
  au démarrage par `agent.js` → un agent installé par MSI **plantait aussitôt**
  (`ERR_MODULE_NOT_FOUND`) et ne démarrait jamais. Les 14 modules runtime (dont
  le nouveau `store.js`) sont désormais packagés ; couverture vérifiée.

**Reste prioritaire (identifié par l'audit du 2026-07-02, non fait) :**
- [x] **Idempotence de l'ingest agent** : events + visites web dédupliqués par id
  fourni par l'agent (filtre serveur), `AppUsage` en SET cumulatif monotone (plus
  de double-compte sur retry). Backward-compat des deux côtés. (`api/agent/sync`)
- [x] **Écritures runtime vs ACL d'auto-protection** : les artefacts runtime
  (heartbeat, `state.json`, cache offline) vivent dans `%ProgramData%\Kidora`,
  créé avec droit *Modify* pour l'enfant (`install-agent.ps1`) ; scripts en RX.
- [x] **Restauration DNS par le gardien** : après un crash dur, `guardian.ps1`
  restaure le DNS automatique quand une redirection Kidora (`127.0.0.1`) est
  orpheline (agent hors service) — l'enfant garde une résolution DNS. (PR #299)
- [x] **Scheduler auto-hébergement** : `instrumentation.ts` lance un ordonnanceur
  en processus (rétention, offline-check, rapports) hors Vercel quand `CRON_SECRET`
  est défini (no-op sur Vercel/Edge) ; `install.sh` le génère.
- [x] **Dashboard/mobile hors-ligne** : SW `network-first` avec cache (jamais
  `/api`) + `offline.html` ; `client.ts`/`api.ts` avec timeout + retry sûr (GET) ;
  bannière hors-ligne. Écran blanc évité quand le serveur est injoignable.

## 🤖 IA configurable par le parent (OpenRouter) — 2026-07-01
- [x] Le parent branche sa **propre clé OpenRouter** (chiffrée au repos) et **choisit le modèle** (DeepSeek, GPT-4o-mini, Gemini Flash, Claude Haiku…) via un **tableau comparatif de prix** ($/1M tokens) et de contexte, alimenté par le catalogue **live** d'OpenRouter (routes `GET/PUT /api/account/ai`, `GET /ai/models`, `POST /ai/test`).
- [x] Le modèle choisi **affine la détection de risque** des messages/recherches (`combinedRisk` = heuristique + LLM, le plus sévère l'emporte) ; **borné** (budget par sync, timeout 6 s, JSON strict) et **repli automatique** sur l'heuristique en cas d'échec → jamais de régression.

## 🛡️ Audit & durcissement (nuit du 2026-07-01)

Quatre audits ciblés (serveur, agent, client React, auth/sécurité) → **19 correctifs vérifiés** (#208–#227), `main` resté vert. Corrigés :
- **Robustesse API** : `?days=` NaN ne 500 plus (report/usage/cron) ; horodatages agent assainis (`safeDate`) ; `commandResults` borné + status enum ; **anti-flood d'alertes** (cap + dédup par sync) ; histogramme d'activité **conscient du fuseau** ; fenêtres insights **égales (7 j)** ; `formatDuration` ne rend plus « 1 h 60 ».
- **Sécurité** : crons **fail-closed** sans `CRON_SECRET` ; **timing du login égalisé** (anti-énumération) ; **rate-limit 2FA** ; **suppression de compte ré-authentifiée** (mdp + TOTP) ; **secret TOTP chiffré au repos** ; **révocation de session** (`tokenVersion`, déconnexion globale après reset/changement de mdp) ; expiry du token de vérif email ; **codes de secours 2FA** (récupération à usage unique, web + mobile).
- **Agent** : **DNS/hosts restaurés** à l'arrêt/désinstallation (SIGTERM + désinstalleur) ; **coucher nocturne** respecte le jour de début ; **socket DNS upstream unique** multiplexé (anti-épuisement de ports) ; télémétrie de blocage non tronquée.
- **Commandes** : un **broadcast** (verrou/localiser/capture/message) atteint **tous** les appareils (fan-out), plus un seul.
- **Géoloc** : ping précédent **scopé à l'appareil** (fin des fausses alertes entrée/sortie).
- **Client** : plus de spinner/bouton bloqué sur erreur réseau (routines, temps d'écran, alertes, demandes de temps) ; `routines-card` ne plante plus sur JSON malformé.

**Reste à décider/faire** (suivi, non bloquant) :
- [x] **Fuseau horaire bout-en-bout** (fait, PRs #242/#249/#250) : `Child.tzOffsetMinutes` rapporté par les agents (`-getTimezoneOffset()`), stocké au sync ; le serveur bucketise le jour de temps d'écran, les bonus et « aujourd'hui » en heure locale (`lib/localdate`) ; les agents datent l'usage en local. La limite roule à **minuit local**.
- [x] **Idempotence du sync + ack des commandes** : usage en SET cumulatif monotone (plus de double-compte) ; commandes **exactly-once** côté agent (log borné d'ids exécutés, persisté ; une commande redélivrée est ré-ackée mais pas rejouée) au-dessus de la redélivraison at-least-once du serveur. (PR #302)
- [x] **Anti-bruteforce robuste en prod** : store **partagé en base** (upserts atomiques `ON CONFLICT…RETURNING`, mêmes requêtes SQLite & Postgres — compteurs et verrous survivent aux redémarrages et valent pour toutes les instances serverless), sélection `RATE_LIMIT_STORE` (défaut : db en prod, mémoire en dev), **dégradation en mémoire par instance** si la DB est en panne (fail-open journalisé) ; **IP de confiance** — le XFF est lu depuis la droite (`TRUSTED_PROXY_HOPS`, défaut 1 = l'entrée ajoutée par notre proxy), les entrées préfixées par le client (spoof) sont ignorées, junk rejeté ; purge des fenêtres expirées dans le cron cleanup ; 22 tests (unitaires mémoire + intégration DB réelle).
- [x] **Vérification d'email** : token à expiration 24h (déjà en place) + **ré-vérification au changement d'adresse** — changer d'email ré-ouvre la vérification (le nouveau mailbox doit être confirmé) quand le SMTP est configuré. (PR de cette session)

## ✅ Fait (v1.0 — fondations fonctionnelles)

- [x] Modèle de données complet (parents, enfants, appareils, règles, télémétrie)
- [x] API REST : auth, enfants, règles (apps/web/temps d'écran), alertes, commandes
- [x] API agent : enroll, sync (télémétrie + alertes + géofences), policy
- [x] Moteur de classification de contenu (apps + domaines)
- [x] Dashboard parent complet (vue d'ensemble, onglets par enfant, rapports)
- [x] Agent Windows : surveillance + blocage apps + filtrage hosts + verrouillage
- [x] App mobile Expo : compagnon parent + agent de localisation enfant
- [x] **États d'erreur honnêtes (mobile)** : composant `ErrorState` réutilisable (icône hors-ligne, message, bouton « Réessayer », `accessibilityRole="alert"`) câblé sur les écrans qui chargent des données (Vidéos, Messages, détail enfant, Alertes) — un échec réseau n'affiche plus à tort un état « vide » ; typecheck mobile vert
- [x] **Statut « en ligne » mobile dérivé de la récence** (parité avec le correctif serveur) : helper `src/device.ts` `isDeviceOnline` (fenêtre 2 min) utilisé dans les replis (accueil parent + détail enfant) quand `/live` est indisponible — un appareil éteint n'apparaît plus « En ligne » ; typecheck mobile vert
- [x] **Alertes mobiles cliquables** (parité web #62) : taper une alerte ouvre la fiche de l'enfant concerné (`router.push('/child/:id')`, `childId` ajouté au type `Alert`) ; typecheck mobile vert
- [x] **Afficher/masquer le mot de passe (login mobile)** (parité web #78) : bouton œil `aria-label`isé sur le champ mot de passe ; typecheck mobile vert
- [x] **Écran « Kidora Kids » plus ludique & utile** : ton bienveillant adapté (état pause vs protégé), **puce « temps d'écran aujourd'hui »** (Android `UsageStats`), et surtout un **bouton « Demander plus de temps » (+15 / +30 min)** qui envoie une **vraie demande aux parents** via le `sync` (`timeRequest` → alerte parent, flux #61), avec confirmation « demande envoyée » ; typecheck mobile vert
- [x] **Carte « temps restant » (Kids)** : à partir de la **policy** renvoyée par le `sync` (limite du jour + bonus accordé) et de l'usage Android, l'enfant voit **« Il te reste X »** + **barre de progression colorée** (vert→ambre→rouge) + un **encouragement** adaptatif (« Profite bien ! 🎉 » … « Le temps d'écran est fini 🌙 ») ; repli sur la puce d'usage si aucune limite ; type `Policy` mobile étendu (`screenTime`) ; typecheck mobile vert
- [x] **États Kids illustrés & animés** : mascottes IA dédiées par état — éveillée, **endormie** (coucher), **en pause** (assise, qui souffle) — + **étincelles** d'ambiance, **flottement/halo** animés, **récompense « Bravo »**, **célébration ressort** « demande envoyée », **« ⏳ en attente »**, **« +X min accordées 🎉 »** quand le parent accorde, **heure du coucher (« 🌙 Dodo à 21:00 »)**, **état « temps libre » illustré** (mascotte au soleil) ; tout respecte `prefers-reduced-motion` ; typecheck mobile vert
- [x] **États d'erreur honnêtes (dashboard web)** : composant `ErrorCard` (`role="alert"`, bouton « Réessayer ») sur les onglets Vidéos & Messages — l'échec de chargement (rejet de `api.get`) affiche une erreur avec relance au lieu d'un faux état vide, et le rejet n'est plus non géré
- [x] **Correctif spinner infini (onglets Activité & Rapports)** : `setLoading(false)` était dans le `.then`, donc un échec de fetch laissait le spinner tourner indéfiniment ; passage à `.catch`/`.finally` + `ErrorCard` avec relance
- [x] **Classe de bug refermée (Apps, Web, Temps d'écran, Appareils)** : ces onglets faisaient `setLoading(false)` après les `await` sans `try/catch` → même spinner infini sur échec ; `load` converti en `useCallback` avec `try/catch/finally` + `ErrorCard` ; tous les onglets enfant gèrent désormais l'erreur de chargement de façon cohérente (chargements secondaires en best-effort)
- [x] PWA installable · build de production vérifié

## ⭐ Priorités demandées (2026-06-29)
- [x] **Bouton SOS / Panique** (enfant) → alerte critique + localisation + push aux parents (serveur testé ; bouton mobile accessible câblé)
- [x] **Activité en direct** : carte temps réel (app au premier plan, position, batterie, online) sur la vue enfant (polling 15s)
- [x] **Appairage par QR code** : QR généré localement (deep link `kidorachild://enroll`), enrôlement auto de l'app Kids
- [x] **Onboarding guidé** : assistant 3 étapes (bilingue) pour les nouveaux comptes sur la vue d'ensemble
- [~] **Refonte UX app Android** — deux apps séparées, mode sombre, minSdk 23, a11y ; **animations & effets** (dégradés `expo-linear-gradient`, fondu d'entrée, bouclier pulsant, bouton SOS animé) ; **app Parents entièrement repensée** : design system clair/sombre (`src/theme.ts` + `src/ui.tsx`), navigation par onglets, Accueil avec cartes enfants *live* (app en cours, batterie, présence pulsante via `/live`), détail enfant (stats, tendance 7 j, top apps, localisation, actions distantes pause/verrou/message/+15 min), flux d'alertes, connexion redessinée ; typecheck vert · *rendu à vérifier via EAS/appareil*

## 📱 Parité app parent ⇄ web — quasi complète (2026-06-30)
Tout se pilote désormais depuis l'app **Kidora Parents** (Expo/RN), à parité avec le dashboard web. Chaque item vérifié `apps/mobile tsc` vert, un PR à la fois, `main` resté vert.
- [x] **Préférences de notification** (#188) : muter les catégories d'alerte depuis les Réglages (GET `/api/account/notifications` ajouté ; sécurité toujours active)
- [x] **2FA / TOTP** (#189) : activer (QR + secret + code) / désactiver (champ inline cross-plateforme, pas d'`Alert.prompt` iOS-only)
- [x] **Historique de navigation web** (#190) : écran par enfant (catégorie, badge bloqué, ouvrir le site)
- [x] **Localisation : historique + zones** (#191) : position actuelle (badge dans/hors zone, précision), liste des géofences, timeline des pings, ouverture OpenStreetMap (haversine local)
- [x] **Carte appareils** (#192) : par appareil — plateforme, en ligne (récence), dernière activité, batterie
- [x] **Activité par heure** (#193) : histogramme 24 h + heure de pointe + fil d'évènements (logique `hourly.ts` reprise en local)
- [x] **Édition du temps d'écran** (#194) : interrupteur + préréglages « tous les jours » + stepper par jour (préserve les heures du coucher)
- [x] **Édition du filtrage web** (#195) : SafeSearch, bloquer sites inconnus, catégories (sensibles/optionnelles)
- [x] **Règles d'applications** (#196) : sélecteur Autorisée/Limitée/Bloquée + limite quotidienne + usage du jour (PUT optimiste)
- [x] **Mots-clés sensibles** (#197) : ajout libre + suggestions à risque, suppression optimiste
- [x] **Routines** (#198) : activer/désactiver/supprimer les profils horaires (création détaillée sur le web)
- [x] **Zones de sécurité** (#199) : créer une géofence à la position actuelle + suppression
- [x] **Co-parents / multi-tuteurs** (#202) : lister, inviter par email, révoquer depuis les Réglages
- [x] **Famille en pause programmée** + **changement d'email** (sessions précédentes #186/#187)
- [x] **Doc** (#200) section README « Application parent (mobile) » · **CI** (#201) `checkout`/`setup-node` → v5 (fin de la déprécation Node 20)

## 🏅 Niveau pro / expert (directive 2026-06-29)
- [x] **CI GitHub Actions** : typecheck + tests + build à chaque push/PR (badge dans le README)
- [x] Mode sombre **web** (dashboard) — variables CSS + overrides ciblés, bascule persistée par cookie, SSR sans flash ; **badges/teintes `-100` corrigés en sombre** (fonds profonds + texte éclairci, contraste AA)
- [x] États de chargement (skeleton) + error boundary + 404 soignée + **toasts** (succès/erreur, animés) branchés sur les actions clés
- [x] Config **PostgreSQL** prête prod (adapter auto selon `DATABASE_URL`) — `src/lib/prisma.ts` choisit le driver au runtime (sqlite `file:` / postgres `postgres://`, chargement paresseux), `scripts/select-db-provider.mjs` aligne le `provider` du schéma avant `prisma generate` (hooks `postinstall`/`prebuild`), scripts `db:generate`/`db:push`, `serverExternalPackages` + deps `pg`/`@prisma/adapter-pg` ; schéma vérifié générable pour les deux dialectes, 42 tests verts
- [x] Tests d'intégration du moteur de politique (base de test réelle) **+ E2E Playwright du dashboard** : `apps/server/playwright.config.ts` seede une base SQLite jetable (parent démo + enfants), **build & sert un bundle de prod** (pas `next dev` : le websocket HMR de Turbopack ne s'établit pas dans Chromium headless → la page n'hydrate jamais) puis pilote un vrai navigateur — **9 tests** : rendu du login, connexion démo → dashboard, pré-remplissage démo, rejet d'identifiants erronés (reste sur `/login`), garde d'auth (`/dashboard` non connecté → `/login`), ouverture d'une fiche enfant, navigation alertes/paramètres, déconnexion ; scripts `npm run e2e` / `e2e:ui`
- [x] Observabilité : `proxy.ts` (Next 16) — log d'accès structuré JSON + en-tête `x-request-id` ; erreurs API loguées en JSON
- [x] En-têtes de sécurité HTTP : **Content-Security-Policy** (default-src 'self', frame-ancestors 'none', object-src 'none', img-src : miniatures YouTube + tuiles OSM, frame-src : carte OpenStreetMap), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (+ interest-cohort), **HSTS preload**, Cross-Origin-Opener-Policy ; cookie de session httpOnly+secure+sameSite vérifié
- [x] **`<html lang>` dynamique** : l'attribut de langue reflète la locale du cookie (`fr`/`en`) au lieu d'être codé en dur `fr` — correct pour lecteurs d'écran, outils de traduction et SEO
- [x] **Afficher/masquer le mot de passe** sur le formulaire connexion/inscription (bouton œil `aria-label`isé, `type="button"` pour ne pas soumettre)
- [x] **Accessibilité & micro-interactions** : anneaux `:focus-visible` clavier cohérents (boutons/liens/inputs), `:active` scale sur les boutons, respect `prefers-reduced-motion`, titre descriptif + lazy-load sur l'iframe carte
- [x] **Landing page premium** : logo Kidora réel, hero dégradé + titre accentué, grille de 8 fonctionnalités (dont détection de risque IA, vidéos/messages, 2FA) avec hover, section « 3 étapes », bande sécurité, CTA dégradé, footer ; mode sombre soigné
- [x] **Site vitrine animé (3D scrolling)** : refonte de la landing en expérience premium animée (**framer-motion** + **Three.js / react-three-fiber**) — barre de progression de défilement, fond **aurore animé**, **hero en parallaxe qui s'incline vers le curseur en 3D** + **orbe WebGL** vivant (chargé client-only via `next/dynamic ssr:false`, désactivé en `prefers-reduced-motion`), **scrollytelling** illustré (3 visuels générés par IA), **aperçu du tableau de bord** (visuel IA), **compteurs animés** au scroll, **FAQ accordéon**, **nav d'ancres + menu mobile + smooth-scroll**, retour-en-haut, lien « Tester la démo » (pré-remplissage), **404 sombre** assortie ; intégralement respectueux de `prefers-reduced-motion` (+ lien d'évitement) ; typecheck/lint/tests/build verts sur Next 16
- [x] **SEO & PWA** : `robots.txt` + `sitemap.xml` (routes dynamiques sensibles au host), **OpenGraph/Twitter** (image dédiée 1200×630), **données structurées JSON-LD** (`SoftwareApplication`), `theme-color`, **apple-touch-icon** + **icônes PWA PNG 192/512** (any + maskable) pour l'installabilité Android/iOS
- [x] **Boucle « temps d'écran » complète (web + mobile)** : l'enfant demande +15/+30 min → voit « ⏳ en attente » → le parent voit la demande et **accorde le montant exact** (idempotent) depuis l'app → l'enfant a une **célébration « +X min accordées 🎉 »** ; refus → la pastille disparaît. Fiche enfant (app parent) : carte **« temps d'écran restant aujourd'hui »** (limite + bonus, testée `computeScreenTimeToday`)
- [x] Professionnalisation du dépôt : Dependabot, templates issue/PR, CONTRIBUTING, SECURITY
- [x] **Audit de sécurité** : correction IDOR (update de routine cross-famille), rate-limit inscription + enrôlement, garde-fou `AUTH_SECRET` en prod ; toutes les routes enfant scopées à la propriété (vérifié)
- [x] **Robustesse des paramètres de pagination** : helper testé `clampLimit` (`lib/http.ts`) — un `?limit=-1`/`?limit=abc` produisait un `take` négatif/`NaN` (crash Prisma 500 sur la route location) ; appliqué de façon cohérente à 6 routes (location, vidéos, messages, activité, captures, historique web) ; 5 tests unitaires
- [x] **Hygiène des entrées auth** : `.trim()` zod sur le **nom** et l'**email** (inscription) et l'email (connexion) — un nom `"   "` (espaces seuls) est désormais rejeté, et un email avec espaces en bord est accepté + normalisé (connexion tolérante aux espaces) au lieu d'être refusé à tort
- [x] **Politique de mot de passe** : scorer de force (zxcvbn-like, `lib/password-strength.ts`) + indicateur live à l'inscription ; **vérification de fuite Have I Been Pwned** (k-anonymity — seuls 5 car. du SHA-1 sortent, fail-open) ; 7 tests verts
- [x] **Double authentification (2FA / TOTP)** : implémentation RFC 6238 sans dépendance (`lib/totp.ts`, base32 + HMAC-SHA1), enrôlement par QR (`otpauth://`, QR via `qrcode`), endpoints enroll/verify/disable, **challenge au login**, carte d'activation dans Paramètres ; **comparaison à temps constant** (`timingSafeEqual`) ; 8 tests dont les **vecteurs officiels RFC 6238** (T=59 → 287082…) et les bornes de fenêtre (0/1/2)
- [x] **Protection anti-brute-force** : verrouillage progressif après 5 échecs de connexion (clé email+IP, durée croissante 30 s→15 min, oubli après 30 min, reset au succès) + message convivial + `Retry-After` ; 3 tests verts
- [x] **Authentification complète (niveau pro)** : **inscription + vérification d'email** (gracieuse, SMTP-gated, bannière + renvoi), **connexion + 2FA + verrou anti-brute-force**, **mot de passe oublié / réinitialisation** (lien 1 h, ne fuite pas l'existence du compte, HIBP), **changement de mot de passe / d'email** (vérif de l'actuel + politique + HIBP + audit) — toutes **rate-limitées**
- [x] **Actions à distance (web)** : barre Verrouiller / Localiser / Capture / Message sur la fiche enfant (parité avec l'app mobile) · **nudge d'activation** « ajouter un appareil » quand l'enfant n'en a aucun
- [x] **Insight « activité par heure »** : histogramme 24 h (« quand l'enfant est le plus actif ») sur les rapports, helper pur testé · **requêtes overview parallélisées** (TTFB)
- [x] **Préférences de notification par type d'alerte** : le parent peut **muter** les alertes bruyantes (nouvelle app, limite, tentative bloquée, zone, mot-clé) ; **sécurité (SOS, risque IA) toujours active** ; `Parent.alertPrefs` + migration, filtrage au `sync`, lib pure testée
- [x] **Pause programmée** (web + mobile + **familiale**) : couper Internet **30 min / 1 h / 2 h** avec **reprise automatique** (`Child.pausedUntil`, état effectif dans la policy + `live` + overview, helper pur testé) en plus de la pause indéfinie
- [x] **Alerte « appareil hors-ligne »** (anti-tamper) : cron horaire détecte un agent qui ne répond plus depuis `OFFLINE_ALERT_HOURS` (def 12 h) → alerte + push, **une fois par panne** (`Device.offlineNotified`), type mutable
- [x] **Usage vs limite par app** (onglet Apps) : barre « X / Y aujourd'hui » colorée par app limitée · **delta de temps d'écran vs période précédente** sur les rapports · libellés du journal d'audit **bilingues**
- [x] **Insights « cette semaine »** (vue d'ensemble) : temps d'écran + **delta vs semaine précédente**, catégorie n°1, jour le plus actif, alertes — agrégé famille, `buildInsights` pur testé, bilingue
- [x] **Échelle / ops** : **nettoyage automatique des données** (cron quotidien `/api/cron/cleanup`, `RETENTION_DAYS` def 90, dry-run) · index `Alert(parentId, ts)` · `/api/health` sans fuite de métriques (+ latence DB) · **ESLint 100% propre** (0 warning)

## ☁️ Déploiement
- [x] **Build Vercel robuste** (`scripts/vercel-build.mjs`) : l'ancien `vercel-build = db:push && next build` faisait **planter tout le build** si `DATABASE_URL` était absente en prod → aucun déploiement → **404 `NOT_FOUND` opaque**. Le nouveau script ne lance `prisma db push` que si `DATABASE_URL` est configurée ; sinon il **saute** la synchro (avertissement clair) et **déploie quand même** le site (un échec reste visible si l'URL est *présente mais invalide*). `DEPLOYMENT.md` : section **Dépannage 404** (Root Directory `apps/server`, env Production, branche de prod, domaine)

## 📦 Distribution
- [x] Installeur **Linux/Ubuntu** en une commande (`install.sh`)
- [x] **Release GitHub v1.0.0** (archives source téléchargeables) + section Téléchargement & Configuration requise dans le README
- [~] Publier les **APK Android** (Kidora Parents / Kidora Kids) dans les Releases via build EAS — *pipeline prêt* : icônes par rôle générées, profils `parent-apk`/`child-apk` (eas.json), scripts `npm run build:apks` / `release:apks`, workflow `release-apk.yml` (tag `mobile-v*`) ; reste à fournir le **compte Expo/EAS** (`eas init` + secrets `EXPO_TOKEN`/`EAS_PROJECT_ID_*`) pour lancer le build cloud
- [x] Agent **Linux** — le cœur de l'agent est rendu **agnostique de l'OS**
  (`lib/os.js` dispatche vers `lib/win.js` ou le nouveau `lib/linux.js`) ; Linux
  fait la détection d'app (`ps`/`xdotool`), le blocage (`pkill`), l'écran de
  blocage (`zenity`/`yad`), les notifs (`notify-send`), le verrouillage
  (`loginctl`), la batterie (`/sys`), les captures (`scrot`), le filtrage web via
  `/etc/hosts`, et s'installe en **service systemd utilisateur** (`install-linux.sh`).
  Agent Windows inchangé (83 tests verts). *Intégration Linux non testée sur un
  vrai bureau Linux ici — dégradation propre si un outil manque.*

## 🔜 Prochaines étapes

### Serveur / dashboard
- [x] Gestion multi-appareils : page globale « Appareils » (famille entière) + renommer/retirer un appareil
- [x] Vue **Rapports** par enfant (période 7/14/30 j, KPIs, top apps/catégories/domaines, export CSV) ; **période mémorisée** (`localStorage`, restaurée au montage — pas de souci SSR/hydratation)
- [x] **Temps restant aujourd'hui** sur la fiche enfant : la carte « Aujourd'hui » affiche désormais « Il reste X » (vert) / « Limite atteinte » / « Limite dépassée de X » (rouge) en plus de la limite et du pourcentage — le chiffre le plus actionnable pour le parent (bonus inclus)
- [x] Actions à distance depuis le dashboard (verrouiller l'appareil, envoyer un message) via le système de commandes
- [x] Actions familiales groupées (tout mettre en pause / reprendre) sur la vue d'ensemble
- [x] Envoi par email des rapports (cron + résumé d'usage) — agrégation extraite (`lib/report.ts`), email HTML/texte (`report-email.ts`), envoi groupé opt-in (`report-mailer.ts`), transport SMTP optionnel (`mailer.ts`, no-op propre sans config), endpoint `GET /api/cron/reports` (protégé `CRON_SECRET`, `?dryRun=`), cron Vercel hebdo (`vercel.json`), opt-out par parent (`weeklyReportEmail` + toggle Paramètres FR/EN) ; **auth cron extraite & testée** (`lib/cron-auth.ts` : fail-closed en prod sans secret, comparaison du secret à **temps constant** `timingSafeEqual`, 4 tests) ; dry-run vérifié (16 candidats, 1 envoyé, 15 sans activité ignorés)
- [x] Demandes de temps supplémentaire (enfant → parent approuve) + octroi manuel de bonus, étend la limite du jour (policy + agent) ; **correctif double-octroi** : l'approbation est désormais **idempotente** (une demande déjà traitée n'accorde plus de temps ; claim atomique `updateMany where status:pending` contre la course double-clic / multi-onglets)
- [x] Édition des géofences depuis le dashboard (ajout/suppression, pré-rempli par la position) — *carte cliquable = polish futur*
- [x] **Géofencing extrait & testé** : `lib/geo.ts` pur (haversine en mètres, `isWithinRadius`, `geofenceTransition` enter/exit) remplace le calcul inline de la route de sync — **garde anti-`NaN`** sur points quasi-antipodaux, premier ping ne déclenche jamais de « départ », flags `notifyOnEnter/Exit` respectés ; 10 tests unitaires (dont distance Paris↔Lyon ≈ 392 km)
- [x] Surveillance de mots-clés sensibles (recherches + titres de pages) → alertes, liste intégrée + mots-clés personnalisés par enfant ; **correctif faux positifs** : les acronymes courts (`kys`, `xxx`, `mdma`) matchent désormais en **mot entier** (« kyste »/« skys » ne déclenchent plus « kys ») — tests de régression
- [x] **Détection de risque par IA heuristique** (`lib/risk.ts`) — scorer pondéré multi-catégories (automutilation, **prédation/grooming** avec boost de combinaison, harcèlement, sexuel, drogues, violence) → score 0-100 + niveau ; appliqué aux **messages** (medium+) et recherches/web (high+) au sync → alertes par sévérité + push critique ; 6 tests verts (façon Bark/Helmit)
- [x] **Vidéos YouTube regardées** (PC + téléphone) avec **miniatures** + **Messages SMS** (reçus/envoyés) — modèles `WatchedVideo`/`Message`, sync agent (`videos`/`messages`), endpoints `/videos` & `/messages`, onglets dashboard (Vidéos avec vignettes, Messages en bulles) + écrans mobile (détail enfant → Vidéos/Messages), seed démo ; agent Windows capture les titres YouTube (titre de fenêtre) + URL/miniature best-effort (UIAutomation) ; lecture SMS = module natif Android (permissions `READ_SMS`/`RECEIVE_SMS` déclarées, chemin de remontée prêt) ; build serveur vert + typecheck mobile vert
- [x] **Export CSV par liste** : vidéos, messages et navigation web exportables en CSV (boutons « Exporter CSV » sur les onglets Vidéos/Messages, endpoint `/export?type=`), helper `lib/csv` RFC 4180 + **anti-injection de formule** (CSV injection) + BOM UTF-8 pour Excel — 11 tests unitaires
- [x] Multi-tuteurs : inviter un co-parent par email (accès partagé aux enfants, révocable) — contrôle d'accès propriétaire/tuteur
- [x] Notifications **web push** pour les alertes critiques (VAPID, service worker, abonnement, envoi auto) — *Expo push mobile à venir*
- [x] **Filtres d'alertes (dashboard)** : puces Toutes / Non lues / Critiques / Avertissements avec compteurs en direct, filtrage côté client, état vide dédié par filtre, `aria-pressed`, bilingue FR/EN, mode sombre
- [x] **Alertes cliquables** : chaque alerte (page Alertes + « Alertes récentes » de la vue d'ensemble) renvoie vers la fiche de l'enfant concerné ; la zone texte est un lien, le bouton « marquer lu » reste séparé (pas de conflit d'interaction)
- [x] **Tuiles de synthèse cliquables (vue d'ensemble)** : « Appareils en ligne » → page Appareils, « Alertes non lues » → page Alertes (composant `Tile` accepte un `href`, hover/translate)
- [x] **Titre d'onglet par enfant** (`generateMetadata`) : « 🧒 Léa · Kidora » dans l'onglet du navigateur ; **+ correctif #63 oublié** : le point « en ligne » de l'en-tête enfant (`ChildHeader`) utilisait encore `device.online` brut → désormais dérivé de la récence (`isDeviceOnline`)
- [x] **Recherche d'enfants (vue d'ensemble)** : champ de filtre par nom (composant client `ChildrenGrid`) qui n'apparaît qu'au-delà de 3 enfants, état « aucun résultat », bilingue FR/EN
- [x] **Tri des appareils par activité** : helper pur `sortDevicesByActivity` (en ligne d'abord, puis vu le plus récemment, puis le plus ancien créé ; jamais-vu en dernier) appliqué à la liste des appareils d'un enfant — 5 tests unitaires
- [x] **Correctif « en ligne pour toujours »** : le booléen `device.online` était mis à `true` à l'enroll/sync mais **jamais remis à `false`** → un appareil éteint restait « En ligne ». Statut désormais **dérivé de la récence** (`lib/device-status.ts` `isDeviceOnline`, fenêtre 2 min) appliqué de façon cohérente (`/live`, route liste appareils, vue d'ensemble compteur+cartes, page Appareils globale) — 6 tests unitaires
- [x] **Cohérence i18n vue d'ensemble** : textes auparavant codés en dur en français (« Catégories aujourd'hui », « Actif/Hors ligne », « En pause », « X appareils · Y en ligne », « … aujourd'hui ») câblés sur le dictionnaire (`overview.*` + `common.active/offline/paused`) ; `ChildrenGrid` utilise `useT` — vue d'ensemble entièrement bilingue FR/EN
- [x] Routines / profils horaires (école/devoirs) — bloquent des apps sur une plage ; appliqué dynamiquement par le moteur de policy

### Agent Windows
- [x] Catégoriseur de domaines (`lib/categories.ts`) — correctif faux positifs : le signal « adulte » `sex` est ancré sur une limite de mot (essex.com / sussex.ac.uk / middlesex.gov.uk ne sont plus classés « adulte »), `sex.com`/`sexcam.net` toujours détectés ; tests de régression
- [x] **Historique de navigation (dashboard)** : carte « Historique récent » sur l'onglet Web — endpoint `GET /api/children/:id/web-visits` (20 dernières visites, propriété vérifiée), chaque visite avec domaine/titre, **catégorie** (emoji), **badge bloqué** et temps relatif ; **bouton « Exporter CSV »** (réutilise `/export?type=web`) ; chargement best-effort (n'empêche pas l'onglet), bilingue FR/EN
- [x] Filtrage web par catégorie au niveau DNS (proxy local) plutôt que hosts — mini-resolveur sinkhole en Node pur (`lib/dns-proxy.js` + `lib/dns.js` codec + `lib/domains.js` catégoriseur), bascule le DNS système sur 127.0.0.1 (admin) ; bloque par **catégorie** (même domaines inconnus via signaux mots-clés), liste de domaines + sous-domaines, `blockUnknown`, **SafeSearch** par CNAME ; forward upstream (1.1.1.1) ; remonte les blocages en `webVisits` ; fallback `hosts` + restauration DNS à l'arrêt/crash ; **22 tests verts** (décisions, codec, proxy live avec faux upstream)
- [x] Écran de blocage en superposition (au lieu du verrouillage complet) — overlay plein écran branché Kidora (`overlay.ps1`, multi-écrans, topmost, piloté par fichier d'état) affiché par l'enforcer sur pause/coucher/limite ; **se retire automatiquement** quand la condition se lève (machine à états par transitions) ; teardown fiable par balayage ligne de commande (testé : show/hide réel, 0 orphelin) ; capteur auto-résilient ; `LockWorkStation` conservé pour la commande distante `lock`
- [x] Capture d'écran à la demande (commande `screenshot`) — capture PowerShell, upload gardé par auth, galerie dans le dashboard
- [x] Auto-protection (empêcher l'arrêt du service par l'enfant) — gardien **SYSTEM** `KidoraGuardian` (~1 min, non tuable par un compte standard) qui relance/réinstalle/réactive l'agent et redémarre un agent figé ; tâche agent durcie (redémarrage auto, logon+boot, masquée), **heartbeat** (`heartbeat.json`) pour détecter un agent bloqué, **ACL** lecture seule sur les scripts, capteur auto-résilient ; flags `-NoSelfProtect`/`-ChildUser`/`-DryRun` ; PS parse-OK + dry-run vérifiés (aucune tâche créée)
- [~] Signature + installeur MSI — source **WiX v4/v5** (`installer/kidora-agent.wxs`, harvest auto des fichiers, install dans Program Files, custom actions post-install/désinstall qui appellent `install-agent.ps1` avec `TOKEN`/`SERVER`/`CHILDUSER`), scripts `build-msi.ps1` + `sign-msi.ps1` (signtool, cert ou auto-signé de test), workflow CI `release-msi.yml` (tag `agent-v*` → build + signe via secret PFX → publie dans la Release) ; **XML/YAML/PS validés**, MSI **bâti en CI** (compilation WiX non testable localement — download bloqué)

### Mobile (dev build natif EAS)
- [x] **Directive UX Android** : **mode sombre** système (`useTheme`/`useColorScheme`, palettes claire+sombre) ; **accessibilité** — `accessibilityRole`/`accessibilityLabel` sur toute l'UI (kit `Btn`/`SectionHeader`/`Stat`/`Pill` + écrans), éléments décoratifs masqués aux lecteurs d'écran, cibles ≥48dp (`Btn` 50, inputs 48, `hitSlop`), **mise à l'échelle des polices** (corps/titres libres, plafond sur les puces compactes), **`reduce-motion`** honoré dans le kit (`useReduceMotion`, `PulseDot`/`Skeleton` statiques) ; **layouts responsives** (colonne de contenu centrée, `layout.contentMax` — tablette/paysage) ; **`minSdk` 23** (quasi tous les appareils) ; états vides/chargement soignés (`Empty`/`Skeleton`/`ErrorState`) ; onboarding guidé (inscription + ajout enfant/appareil). (PRs #303/#304)
- [~] Android : module natif `UsageStatsManager` (usage apps) écrit + branché au sync (deltas) — *à compiler via EAS, non vérifiable en Expo Go*
- [x] Android : `AccessibilityService` (blocage d'apps) — module natif `app-blocker`, service + overlay pilotés par la politique (PR #306)
- [~] Android : `VpnService` (filtrage web on-device) — module natif `dns-filter` : VPN qui capture **uniquement le DNS** (route le /32 d'un résolveur factice), décide par catégorie/blocklist/SafeSearch/blockUnknown (**catégoriseur porté du proxy DNS desktop**), sinkhole les blocages, redirige les moteurs de recherche vers leur hôte SafeSearch (CNAME + A résolus), forwarde le reste à un upstream via socket protégé ; consentement VPN une fois, service *foreground* `specialUse`, politique persistée (SharedPreferences), bouton d'activation dans le mode enfant. Logique de décision **testée en TS pur (13 tests)**, Kotlin **revu** ; *à compiler via EAS + vérifier sur appareil (non exécutable en Expo Go)*
- [~] iOS : module scaffold (renvoie « non supporté ») + doc FamilyControls/DeviceActivity/ManagedSettings (entitlement Apple requis)
- [~] Localisation en arrière-plan (`expo-task-manager` + `expo-location`) — tâche écrite & branchée (start/stop dans le mode enfant) ; *à vérifier sur appareil*
- [~] **Géofences natives + alertes locales** : le sync renvoie les zones de l'enfant (géométrie seule) ; l'appareil enregistre des **géofences OS** (`Location.startGeofencingAsync` + tâche `expo-task-manager`) qui réveillent l'app au franchissement — à l'entrée/sortie il **pousse un ping immédiat** (le serveur calcule la transition avec son hystérésis existant → alerte parent prompte, pas de double source) **et affiche une notification locale** (`expo-notifications`) à l'enfant ; refresh à chaque sync, arrêt à la dissociation. Test d'intégration serveur (le sync renvoie bien les géofences) ; *à vérifier sur appareil (géofencing/notifs non fiables en Expo Go)*

### Qualité / industrialisation
- [x] Tests unitaires Vitest (catégorisation, mots-clés, **détection de risque**, **TOTP**, **force/breach mot de passe**, **anti-brute-force**, fenêtres horaires coucher/routines, **agrégation des rapports**, **export CSV**, **formatage durées/temps relatif**, **géofencing (haversine + transitions)**, **HIBP k-anonymity (fetch mocké, fail-open)**, **tri des appareils**, **auth cron**, chiffrement) — **186 tests verts** ; *Playwright dashboard à venir*
- [x] **Tests mobile (jest-expo)** — première couverture de la logique pure de l'app Expo : fenêtres de coucher/`nextBedtimeStart` (`schedule`, y c. fenêtres à cheval sur minuit), formatage durée/temps relatif/miniatures YouTube/catégories (`theme`), **file SOS hors-ligne** (`sos-queue` : cap, dédup, tolérance au store corrompu, mock du stockage) — **26 tests** ; comble la seule zone du code sans couverture
- [x] Rate limiting (auth) + journal d'audit des actions du compte (visible dans Paramètres)
- [x] Migration Postgres + déploiement Vercel de référence — adapter auto Postgres (cf. plus haut) + déploiement **un clic** : `vercel.json` (`framework`, `buildCommand: vercel-build`, crons), script `vercel-build` (= `db:push` + `next build` → schéma Postgres **créé au build**, idempotent), **bouton « Deploy with Vercel »** (root `apps/server` pré-réglé, prompts d'env) dans le README + `DEPLOYMENT.md` (bouton, import manuel, étapes), seed démo documenté
- [x] i18n (FR/EN) — navigation + tous les onglets (vue d'ensemble, apps, web, temps d'écran, activité, rapports, localisation, **appareils**) + paramètres + alertes + onboarding ; *quelques sous-cartes mineures restent en FR*
- [x] Endpoint `/api/health` (liveness/readiness + compteurs)
- [x] Export des données (JSON) + suppression de compte (RGPD) avec confirmation
- [x] Chiffrement au repos des données sensibles (captures d'écran, AES-256-GCM, rétrocompatible) — `DATA_ENC_KEY`
