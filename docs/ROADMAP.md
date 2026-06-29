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
- [ ] Rapports hebdomadaires par email (cron + résumé d'usage)
- [x] Demandes de temps supplémentaire (enfant → parent approuve) + octroi manuel de bonus, étend la limite du jour (policy + agent)
- [x] Édition des géofences depuis le dashboard (ajout/suppression, pré-rempli par la position) — *carte cliquable = polish futur*
- [x] Surveillance de mots-clés sensibles (recherches + titres de pages) → alertes, liste intégrée + mots-clés personnalisés par enfant
- [ ] Multi-tuteurs (inviter un 2ᵉ parent), rôles
- [ ] Notifications push (web push + Expo push) pour les alertes critiques
- [ ] Mode « jumeau » horaires (école/devoirs) avec profils de règles

### Agent Windows
- [ ] Filtrage web par catégorie au niveau DNS (proxy local) plutôt que hosts
- [ ] Écran de blocage en superposition (au lieu du verrouillage complet)
- [ ] Capture d'écran à la demande (commande `screenshot`)
- [ ] Auto-protection (empêcher l'arrêt du service par l'enfant)
- [ ] Signature + installeur MSI

### Mobile (dev build natif EAS)
- [ ] Android : `UsageStatsManager` (usage apps), `AccessibilityService` (blocage),
      `VpnService` (filtrage web), localisation en arrière-plan
- [ ] iOS : FamilyControls / ManagedSettings / DeviceActivity (Screen Time API)
- [ ] Géofences natives + alertes locales

### Qualité / industrialisation
- [ ] Tests (Vitest pour les libs, Playwright pour le dashboard)
- [ ] Rate limiting + audit log
- [ ] Migration Postgres + déploiement Vercel de référence
- [ ] i18n (FR/EN)
- [ ] Chiffrement au repos des données sensibles
