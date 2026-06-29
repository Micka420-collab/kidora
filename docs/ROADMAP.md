# Roadmap Kidora

## ✅ Fait (v1.0 — fondations fonctionnelles)

- [x] Modèle de données complet (parents, enfants, appareils, règles, télémétrie)
- [x] API REST : auth, enfants, règles (apps/web/temps d'écran), alertes, commandes
- [x] API agent : enroll, sync (télémétrie + alertes + géofences), policy
- [x] Moteur de classification de contenu (apps + domaines)
- [x] Dashboard parent complet (vue d'ensemble, onglets par enfant, rapports)
- [x] Agent Windows : surveillance + blocage apps + filtrage hosts + verrouillage
- [x] App mobile Expo : compagnon parent + agent de localisation enfant
- [x] PWA installable · build de production vérifié

## ⭐ Priorités demandées (2026-06-29)
- [x] **Bouton SOS / Panique** (enfant) → alerte critique + localisation + push aux parents (serveur testé ; bouton mobile accessible câblé)
- [x] **Activité en direct** : carte temps réel (app au premier plan, position, batterie, online) sur la vue enfant (polling 15s)
- [x] **Appairage par QR code** : QR généré localement (deep link `kidorachild://enroll`), enrôlement auto de l'app Kids
- [x] **Onboarding guidé** : assistant 3 étapes (bilingue) pour les nouveaux comptes sur la vue d'ensemble
- [~] **Refonte UX app Android** — deux apps séparées, mode sombre, minSdk 23, a11y ; **animations & effets** (dégradés `expo-linear-gradient`, fondu d'entrée, bouclier pulsant, bouton SOS animé) ; **app Parents entièrement repensée** : design system clair/sombre (`src/theme.ts` + `src/ui.tsx`), navigation par onglets, Accueil avec cartes enfants *live* (app en cours, batterie, présence pulsante via `/live`), détail enfant (stats, tendance 7 j, top apps, localisation, actions distantes pause/verrou/message/+15 min), flux d'alertes, connexion redessinée ; typecheck vert · *rendu à vérifier via EAS/appareil*

## 🏅 Niveau pro / expert (directive 2026-06-29)
- [x] **CI GitHub Actions** : typecheck + tests + build à chaque push/PR (badge dans le README)
- [x] Mode sombre **web** (dashboard) — variables CSS + overrides ciblés, bascule persistée par cookie, SSR sans flash
- [x] États de chargement (skeleton) + error boundary + 404 soignée + **toasts** (succès/erreur, animés) branchés sur les actions clés
- [x] Config **PostgreSQL** prête prod (adapter auto selon `DATABASE_URL`) — `src/lib/prisma.ts` choisit le driver au runtime (sqlite `file:` / postgres `postgres://`, chargement paresseux), `scripts/select-db-provider.mjs` aligne le `provider` du schéma avant `prisma generate` (hooks `postinstall`/`prebuild`), scripts `db:generate`/`db:push`, `serverExternalPackages` + deps `pg`/`@prisma/adapter-pg` ; schéma vérifié générable pour les deux dialectes, 42 tests verts
- [~] Tests d'intégration du moteur de politique (base de test réelle, 42 tests) ; *e2e Playwright à venir*
- [x] Observabilité : `proxy.ts` (Next 16) — log d'accès structuré JSON + en-tête `x-request-id` ; erreurs API loguées en JSON
- [x] En-têtes de sécurité HTTP : **Content-Security-Policy** (default-src 'self', frame-ancestors 'none', object-src 'none', img-src : miniatures YouTube + tuiles OSM, frame-src : carte OpenStreetMap), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (+ interest-cohort), **HSTS preload**, Cross-Origin-Opener-Policy ; cookie de session httpOnly+secure+sameSite vérifié
- [x] **Accessibilité & micro-interactions** : anneaux `:focus-visible` clavier cohérents (boutons/liens/inputs), `:active` scale sur les boutons, respect `prefers-reduced-motion`, titre descriptif + lazy-load sur l'iframe carte
- [x] **Landing page premium** : logo Kidora réel, hero dégradé + titre accentué, grille de 8 fonctionnalités (dont détection de risque IA, vidéos/messages, 2FA) avec hover, section « 3 étapes », bande sécurité, CTA dégradé, footer ; mode sombre soigné
- [x] Professionnalisation du dépôt : Dependabot, templates issue/PR, CONTRIBUTING, SECURITY
- [x] **Audit de sécurité** : correction IDOR (update de routine cross-famille), rate-limit inscription + enrôlement, garde-fou `AUTH_SECRET` en prod ; toutes les routes enfant scopées à la propriété (vérifié)
- [x] **Politique de mot de passe** : scorer de force (zxcvbn-like, `lib/password-strength.ts`) + indicateur live à l'inscription ; **vérification de fuite Have I Been Pwned** (k-anonymity — seuls 5 car. du SHA-1 sortent, fail-open) ; 7 tests verts
- [x] **Double authentification (2FA / TOTP)** : implémentation RFC 6238 sans dépendance (`lib/totp.ts`, base32 + HMAC-SHA1), enrôlement par QR (`otpauth://`, QR via `qrcode`), endpoints enroll/verify/disable, **challenge au login**, carte d'activation dans Paramètres ; 5 tests verts
- [x] **Protection anti-brute-force** : verrouillage progressif après 5 échecs de connexion (clé email+IP, durée croissante 30 s→15 min, oubli après 30 min, reset au succès) + message convivial + `Retry-After` ; 3 tests verts

## 📦 Distribution
- [x] Installeur **Linux/Ubuntu** en une commande (`install.sh`)
- [x] **Release GitHub v1.0.0** (archives source téléchargeables) + section Téléchargement & Configuration requise dans le README
- [~] Publier les **APK Android** (Kidora Parents / Kidora Kids) dans les Releases via build EAS — *pipeline prêt* : icônes par rôle générées, profils `parent-apk`/`child-apk` (eas.json), scripts `npm run build:apks` / `release:apks`, workflow `release-apk.yml` (tag `mobile-v*`) ; reste à fournir le **compte Expo/EAS** (`eas init` + secrets `EXPO_TOKEN`/`EAS_PROJECT_ID_*`) pour lancer le build cloud
- [ ] Agent **Linux** (surveillance natif) — équivalent de l'agent Windows

## 🔜 Prochaines étapes

### Serveur / dashboard
- [x] Gestion multi-appareils : page globale « Appareils » (famille entière) + renommer/retirer un appareil
- [x] Vue **Rapports** par enfant (période 7/14/30 j, KPIs, top apps/catégories/domaines, export CSV)
- [x] Actions à distance depuis le dashboard (verrouiller l'appareil, envoyer un message) via le système de commandes
- [x] Actions familiales groupées (tout mettre en pause / reprendre) sur la vue d'ensemble
- [x] Envoi par email des rapports (cron + résumé d'usage) — agrégation extraite (`lib/report.ts`), email HTML/texte (`report-email.ts`), envoi groupé opt-in (`report-mailer.ts`), transport SMTP optionnel (`mailer.ts`, no-op propre sans config), endpoint `GET /api/cron/reports` (protégé `CRON_SECRET`, `?dryRun=`), cron Vercel hebdo (`vercel.json`), opt-out par parent (`weeklyReportEmail` + toggle Paramètres FR/EN) ; dry-run vérifié (16 candidats, 1 envoyé, 15 sans activité ignorés), 48 tests verts
- [x] Demandes de temps supplémentaire (enfant → parent approuve) + octroi manuel de bonus, étend la limite du jour (policy + agent)
- [x] Édition des géofences depuis le dashboard (ajout/suppression, pré-rempli par la position) — *carte cliquable = polish futur*
- [x] Surveillance de mots-clés sensibles (recherches + titres de pages) → alertes, liste intégrée + mots-clés personnalisés par enfant
- [x] **Détection de risque par IA heuristique** (`lib/risk.ts`) — scorer pondéré multi-catégories (automutilation, **prédation/grooming** avec boost de combinaison, harcèlement, sexuel, drogues, violence) → score 0-100 + niveau ; appliqué aux **messages** (medium+) et recherches/web (high+) au sync → alertes par sévérité + push critique ; 6 tests verts (façon Bark/Helmit)
- [x] **Vidéos YouTube regardées** (PC + téléphone) avec **miniatures** + **Messages SMS** (reçus/envoyés) — modèles `WatchedVideo`/`Message`, sync agent (`videos`/`messages`), endpoints `/videos` & `/messages`, onglets dashboard (Vidéos avec vignettes, Messages en bulles) + écrans mobile (détail enfant → Vidéos/Messages), seed démo ; agent Windows capture les titres YouTube (titre de fenêtre) + URL/miniature best-effort (UIAutomation) ; lecture SMS = module natif Android (permissions `READ_SMS`/`RECEIVE_SMS` déclarées, chemin de remontée prêt) ; build serveur vert + typecheck mobile vert
- [x] Multi-tuteurs : inviter un co-parent par email (accès partagé aux enfants, révocable) — contrôle d'accès propriétaire/tuteur
- [x] Notifications **web push** pour les alertes critiques (VAPID, service worker, abonnement, envoi auto) — *Expo push mobile à venir*
- [x] Routines / profils horaires (école/devoirs) — bloquent des apps sur une plage ; appliqué dynamiquement par le moteur de policy

### Agent Windows
- [x] Filtrage web par catégorie au niveau DNS (proxy local) plutôt que hosts — mini-resolveur sinkhole en Node pur (`lib/dns-proxy.js` + `lib/dns.js` codec + `lib/domains.js` catégoriseur), bascule le DNS système sur 127.0.0.1 (admin) ; bloque par **catégorie** (même domaines inconnus via signaux mots-clés), liste de domaines + sous-domaines, `blockUnknown`, **SafeSearch** par CNAME ; forward upstream (1.1.1.1) ; remonte les blocages en `webVisits` ; fallback `hosts` + restauration DNS à l'arrêt/crash ; **22 tests verts** (décisions, codec, proxy live avec faux upstream)
- [x] Écran de blocage en superposition (au lieu du verrouillage complet) — overlay plein écran branché Kidora (`overlay.ps1`, multi-écrans, topmost, piloté par fichier d'état) affiché par l'enforcer sur pause/coucher/limite ; **se retire automatiquement** quand la condition se lève (machine à états par transitions) ; teardown fiable par balayage ligne de commande (testé : show/hide réel, 0 orphelin) ; capteur auto-résilient ; `LockWorkStation` conservé pour la commande distante `lock`
- [x] Capture d'écran à la demande (commande `screenshot`) — capture PowerShell, upload gardé par auth, galerie dans le dashboard
- [x] Auto-protection (empêcher l'arrêt du service par l'enfant) — gardien **SYSTEM** `KidoraGuardian` (~1 min, non tuable par un compte standard) qui relance/réinstalle/réactive l'agent et redémarre un agent figé ; tâche agent durcie (redémarrage auto, logon+boot, masquée), **heartbeat** (`heartbeat.json`) pour détecter un agent bloqué, **ACL** lecture seule sur les scripts, capteur auto-résilient ; flags `-NoSelfProtect`/`-ChildUser`/`-DryRun` ; PS parse-OK + dry-run vérifiés (aucune tâche créée)
- [~] Signature + installeur MSI — source **WiX v4/v5** (`installer/kidora-agent.wxs`, harvest auto des fichiers, install dans Program Files, custom actions post-install/désinstall qui appellent `install-agent.ps1` avec `TOKEN`/`SERVER`/`CHILDUSER`), scripts `build-msi.ps1` + `sign-msi.ps1` (signtool, cert ou auto-signé de test), workflow CI `release-msi.yml` (tag `agent-v*` → build + signe via secret PFX → publie dans la Release) ; **XML/YAML/PS validés**, MSI **bâti en CI** (compilation WiX non testable localement — download bloqué)

### Mobile (dev build natif EAS)
- [ ] **Directive UX Android** : design soigné + **mode sombre**, **accessibilité** (contraste AA, `accessibilityLabel`, cibles ≥48dp, mise à l'échelle des polices), **layouts responsives** (petit téléphone → tablette), **`minSdk` bas (23/24)** pour couvrir quasi tous les appareils, états vides/chargement soignés, onboarding guidé
- [~] Android : module natif `UsageStatsManager` (usage apps) écrit + branché au sync (deltas) — *à compiler via EAS, non vérifiable en Expo Go*
- [ ] Android : `AccessibilityService` (blocage), `VpnService` (filtrage web)
- [~] iOS : module scaffold (renvoie « non supporté ») + doc FamilyControls/DeviceActivity/ManagedSettings (entitlement Apple requis)
- [~] Localisation en arrière-plan (`expo-task-manager` + `expo-location`) — tâche écrite & branchée (start/stop dans le mode enfant) ; *à vérifier sur appareil*
- [ ] Géofences natives + alertes locales

### Qualité / industrialisation
- [x] Tests unitaires Vitest (catégorisation, mots-clés, **détection de risque**, **TOTP**, **force/breach mot de passe**, **anti-brute-force**, fenêtres horaires coucher/routines, **agrégation des rapports**, chiffrement) — **75 tests verts** ; *Playwright dashboard à venir*
- [x] Rate limiting (auth) + journal d'audit des actions du compte (visible dans Paramètres)
- [x] Migration Postgres + déploiement Vercel de référence — adapter auto Postgres (cf. plus haut) + déploiement **un clic** : `vercel.json` (`framework`, `buildCommand: vercel-build`, crons), script `vercel-build` (= `db:push` + `next build` → schéma Postgres **créé au build**, idempotent), **bouton « Deploy with Vercel »** (root `apps/server` pré-réglé, prompts d'env) dans le README + `DEPLOYMENT.md` (bouton, import manuel, étapes), seed démo documenté
- [x] i18n (FR/EN) — navigation + tous les onglets (vue d'ensemble, apps, web, temps d'écran, activité, rapports, localisation, **appareils**) + paramètres + alertes + onboarding ; *quelques sous-cartes mineures restent en FR*
- [x] Endpoint `/api/health` (liveness/readiness + compteurs)
- [x] Export des données (JSON) + suppression de compte (RGPD) avec confirmation
- [x] Chiffrement au repos des données sensibles (captures d'écran, AES-256-GCM, rétrocompatible) — `DATA_ENC_KEY`
