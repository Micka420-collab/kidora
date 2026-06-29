# Politique de sécurité

## Signaler une vulnérabilité

Merci de **ne pas** ouvrir d'issue publique pour une faille de sécurité.
Contactez le mainteneur en privé (GitHub Security Advisories) avec :

- une description de la vulnérabilité,
- les étapes de reproduction,
- l'impact potentiel.

Nous nous efforçons de répondre sous **72 h** et de corriger les failles critiques
en priorité.

## Bonnes pratiques intégrées

- Authentification par JWT en cookie `httpOnly`, mots de passe `bcrypt`.
- Jetons d'enrôlement aléatoires (256 bits) pour les appareils.
- Rate-limiting sur l'authentification, journal d'audit des actions.
- Chiffrement au repos des données sensibles (captures d'écran, AES-256-GCM).
- En-têtes de sécurité HTTP (X-Frame-Options, HSTS, etc.).
- Aucune donnée sensible n'est commitée (`.env`, clés, bases gitignorés).

## Données des mineurs

Kidora traite des données d'enfants mineurs. Toute contribution doit minimiser la
collecte, sécuriser le stockage et respecter le cadre légal applicable (RGPD, etc.).
