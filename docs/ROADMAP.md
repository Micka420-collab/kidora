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

## 🔜 Prochaines étapes

### Serveur / dashboard
- [x] Vue **Rapports** par enfant (période 7/14/30 j, KPIs, top apps/catégories/domaines, export CSV)
- [x] Actions à distance depuis le dashboard (verrouiller l'appareil, envoyer un message) via le système de commandes
- [x] Actions familiales groupées (tout mettre en pause / reprendre) sur la vue d'ensemble
- [ ] Envoi par email des rapports (cron + résumé d'usage) — *vue prête, reste l'envoi*
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
- [~] Android : module natif `UsageStatsManager` (usage apps) écrit + branché au sync (deltas) — *à compiler via EAS, non vérifiable en Expo Go*
- [ ] Android : `AccessibilityService` (blocage), `VpnService` (filtrage web)
- [~] iOS : module scaffold (renvoie « non supporté ») + doc FamilyControls/DeviceActivity/ManagedSettings (entitlement Apple requis)
- [ ] Localisation en arrière-plan (`expo-task-manager`)
- [ ] Géofences natives + alertes locales

### Qualité / industrialisation
- [x] Tests unitaires Vitest (catégorisation, mots-clés, fenêtres horaires coucher/routines, rate-limit) — 36 tests verts ; *Playwright dashboard à venir*
- [x] Rate limiting (auth) + journal d'audit des actions du compte (visible dans Paramètres)
- [ ] Migration Postgres + déploiement Vercel de référence
- [ ] i18n (FR/EN)
- [x] Export des données (JSON) + suppression de compte (RGPD) avec confirmation
- [x] Chiffrement au repos des données sensibles (captures d'écran, AES-256-GCM, rétrocompatible) — `DATA_ENC_KEY`
