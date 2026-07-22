# Changelog

Historique synthétique de Kidora. Le détail exhaustif vit dans
[`docs/ROADMAP.md`](docs/ROADMAP.md) et l'historique Git ; ce fichier retient les
jalons et les vagues de durcissement. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Durcissement — audits adversariaux (2026-07)

Vagues de revue multi-agents sur le serveur, l'agent Windows et le mobile.
Chaque correctif est livré avec son test de régression.

- **Agent — horloge de confiance (critique).** Le plancher monotone anti-triche
  n'est plus jamais relevé depuis l'heure murale : un saut d'horloge en avant
  avant le premier ancrage serveur ne peut plus figer le temps de confiance
  (donc plus de compteur de temps d'écran bloqué / d'accès illimité).
- **Agent — filtrage DNS.** Un blocage explicite (domaine ou catégorie) prime
  désormais sur la redirection SafeSearch. Le journal de déduplication des
  commandes est persisté après exécution (plus de ré-exécution au crash).
- **Serveur — détection de risque.** La normalisation uniformise les espaces
  Unicode (l'espace insécable ne contourne plus les alertes critiques) ; formes
  `proana`/`promia` en un mot ajoutées.
- **Serveur — crons.** Rapports hebdomadaires idempotents (claim atomique,
  anti double-envoi / double-facturation LLM) ; `offline-check` en transaction
  (plus d'alerte d'outage perdue) ; notifications push attendues avant la fin de
  la fonction serverless.
- **Serveur — sécurité comptes.** Déconnexion révoquée côté serveur
  (`tokenVersion`) ; anti-énumération de comptes sur l'invitation de co-parent ;
  clé OpenRouter *fail-closed* si elle ne se déchiffre plus (rotation de clé) ;
  double opt-in au changement d'email (anti-squat / anti-lockout) ; expiration
  des jetons d'enrôlement jamais utilisés.
- **Serveur — commandes & ingestion.** Diffusion des commandes à *tous* les
  appareils de l'enfant, acquittement scopé à l'appareil émetteur ; demandes de
  temps idempotentes ; captures d'écran validées (octets d'image) et conservées
  par appareil.
- **Serveur — temps d'écran.** « 0 min » affiché *Illimité* ; refus des fenêtres
  sans jour et des heures invalides.
- **Mobile — filtrage web.** Signal adulte `sex` ancré sur une frontière de mot
  (parité serveur : plus de faux positif sur sussex/essex/middlesex).

## Jalons

- **Mobile — parité & natif Android.** App *Kidora Parents* alignée sur le
  dashboard ; blocage d'apps natif (`AccessibilityService`), filtrage web
  on-device (`VpnService` DNS) et géofences OS + notifications locales.
  Accessibilité, mode sombre, `reduce-motion`, `minSdk` 24.
- **Qualité.** Tests unitaires + intégration (Vitest), tests agent (`node:test`)
  et mobile (jest-expo) ; E2E Playwright du dashboard ; CI GitHub Actions
  (serveur + mobile) rejouée sur chaque PR.
- **Suite « clé en main & inviolable ».** Horloge de confiance, politique signée
  Ed25519, installeur ZIP pré-configuré / MSI / un-clic, auto-update signé +
  rollback, découverte LAN, résilience hors-ligne (agent, app enfant, dashboard),
  sauvegardes DB automatiques, ordonnanceur d'auto-hébergement.
- **Sécurité comptes.** 2FA/TOTP + codes de secours, mot de passe oublié /
  réinitialisation, vérification d'email, anti-brute-force, force + fuite de mot
  de passe (HIBP), CSP et en-têtes durcis, journal d'audit, RGPD (export /
  suppression / rétention).
- **Plateforme.** Dashboard Next.js 16 + API, moteur de politique effective par
  enfant, agent Windows & Linux, filtrage web par catégorie, temps d'écran,
  routines, localisation & géofences, rapports & insights, notifications web
  push, landing animée.
