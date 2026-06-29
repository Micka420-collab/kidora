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
- [~] **Refonte UX app Android** — deux apps séparées, mode sombre, minSdk 23, a11y ; **animations & effets** (dégradés `expo-linear-gradient`, fondu d'entrée, bouclier pulsant, bouton SOS animé) ; *à compiler via EAS*

## 🏅 Niveau pro / expert (directive 2026-06-29)
- [x] **CI GitHub Actions** : typecheck + tests + build à chaque push/PR (badge dans le README)
- [x] Mode sombre **web** (dashboard) — variables CSS + overrides ciblés, bascule persistée par cookie, SSR sans flash
- [x] États de chargement (skeleton) + error boundary + 404 soignée + **toasts** (succès/erreur, animés) branchés sur les actions clés
- [x] Config **PostgreSQL** prête prod (adapter auto selon `DATABASE_URL`) — `src/lib/prisma.ts` choisit le driver au runtime (sqlite `file:` / postgres `postgres://`, chargement paresseux), `scripts/select-db-provider.mjs` aligne le `provider` du schéma avant `prisma generate` (hooks `postinstall`/`prebuild`), scripts `db:generate`/`db:push`, `serverExternalPackages` + deps `pg`/`@prisma/adapter-pg` ; schéma vérifié générable pour les deux dialectes, 42 tests verts
- [~] Tests d'intégration du moteur de politique (base de test réelle, 42 tests) ; *e2e Playwright à venir*
- [x] Observabilité : `proxy.ts` (Next 16) — log d'accès structuré JSON + en-tête `x-request-id` ; erreurs API loguées en JSON
- [x] En-têtes de sécurité HTTP (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS)
- [x] Professionnalisation du dépôt : Dependabot, templates issue/PR, CONTRIBUTING, SECURITY
- [x] **Audit de sécurité** : correction IDOR (update de routine cross-famille), rate-limit inscription + enrôlement, garde-fou `AUTH_SECRET` en prod ; toutes les routes enfant scopées à la propriété (vérifié)

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
- [x] Multi-tuteurs : inviter un co-parent par email (accès partagé aux enfants, révocable) — contrôle d'accès propriétaire/tuteur
- [x] Notifications **web push** pour les alertes critiques (VAPID, service worker, abonnement, envoi auto) — *Expo push mobile à venir*
- [x] Routines / profils horaires (école/devoirs) — bloquent des apps sur une plage ; appliqué dynamiquement par le moteur de policy

### Agent Windows
- [ ] Filtrage web par catégorie au niveau DNS (proxy local) plutôt que hosts
- [ ] Écran de blocage en superposition (au lieu du verrouillage complet)
- [x] Capture d'écran à la demande (commande `screenshot`) — capture PowerShell, upload gardé par auth, galerie dans le dashboard
- [ ] Auto-protection (empêcher l'arrêt du service par l'enfant)
- [ ] Signature + installeur MSI

### Mobile (dev build natif EAS)
- [ ] **Directive UX Android** : design soigné + **mode sombre**, **accessibilité** (contraste AA, `accessibilityLabel`, cibles ≥48dp, mise à l'échelle des polices), **layouts responsives** (petit téléphone → tablette), **`minSdk` bas (23/24)** pour couvrir quasi tous les appareils, états vides/chargement soignés, onboarding guidé
- [~] Android : module natif `UsageStatsManager` (usage apps) écrit + branché au sync (deltas) — *à compiler via EAS, non vérifiable en Expo Go*
- [ ] Android : `AccessibilityService` (blocage), `VpnService` (filtrage web)
- [~] iOS : module scaffold (renvoie « non supporté ») + doc FamilyControls/DeviceActivity/ManagedSettings (entitlement Apple requis)
- [~] Localisation en arrière-plan (`expo-task-manager` + `expo-location`) — tâche écrite & branchée (start/stop dans le mode enfant) ; *à vérifier sur appareil*
- [ ] Géofences natives + alertes locales

### Qualité / industrialisation
- [x] Tests unitaires Vitest (catégorisation, mots-clés, fenêtres horaires coucher/routines, rate-limit) — 36 tests verts ; *Playwright dashboard à venir*
- [x] Rate limiting (auth) + journal d'audit des actions du compte (visible dans Paramètres)
- [ ] Migration Postgres + déploiement Vercel de référence
- [x] i18n (FR/EN) — navigation + tous les onglets (vue d'ensemble, apps, web, temps d'écran, activité, rapports, localisation, **appareils**) + paramètres + alertes + onboarding ; *quelques sous-cartes mineures restent en FR*
- [x] Endpoint `/api/health` (liveness/readiness + compteurs)
- [x] Export des données (JSON) + suppression de compte (RGPD) avec confirmation
- [x] Chiffrement au repos des données sensibles (captures d'écran, AES-256-GCM, rétrocompatible) — `DATA_ENC_KEY`
