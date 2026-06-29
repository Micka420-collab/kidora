# Kidora Mobile (Expo / React Native)

**Deux applications Android distinctes** depuis une seule base de code, sélectionnées
par la variable `APP_ROLE` au build (deux packages, deux fiches Play Store) :

| App | `APP_ROLE` | Package | Rôle |
|---|---|---|---|
| **Kidora Parents** | `parent` | `app.kidora.parent` | Compagnon : se connecter, voir enfants/appareils/alertes |
| **Kidora Kids** | `child` | `app.kidora.child` | Appareil enfant : enrôlement, localisation, usage, **SOS** |

> **Qualité Android** : mode sombre (`userInterfaceStyle: automatic`), cibles tactiles ≥48dp,
> `accessibilityLabel`, layouts responsives, et **`minSdk` 23** (via `expo-build-properties`)
> pour couvrir la quasi-totalité des appareils Android actifs.

## Démarrage (dev)

```bash
cd apps/mobile
npm install
npm run start:parent     # app Parents (APP_ROLE=parent)
npm run start:child      # app Kids    (APP_ROLE=child)
```

## Builds (deux APK distincts)

```bash
npm run build:parent     # dev-client APK (profil parent)
npm run build:child      # dev-client APK (profil child)
```

> Pour tester depuis un téléphone réel, indiquez l'URL du serveur accessible sur le
> réseau (ex : `http://192.168.1.20:3000`) dans l'écran de connexion.

## Publier les APK (Releases GitHub)

Les builds tournent sur le **cloud EAS** (gratuit avec un compte Expo). On distribue
des **APK** installables (sideload), pas des AAB Play Store.

### Configuration unique

```bash
npm i -g eas-cli          # ou via npx (utilisé par les scripts)
eas login                 # compte Expo  → https://expo.dev
APP_ROLE=parent eas init  # crée le projet EAS « kidora-parent » → note le projectId
APP_ROLE=child  eas init  # crée le projet EAS « kidora-child »  → note le projectId
```

`eas init` lie chaque rôle à un **projet EAS distinct**. Renseignez les deux ids via
`EAS_PROJECT_ID_PARENT` / `EAS_PROJECT_ID_CHILD` (env locale ou secrets CI) — voir
`app.config.ts`.

### Build des APK de production

```bash
npm run build:parent:apk  # profil parent-apk (eas.json)
npm run build:child:apk   # profil child-apk
npm run build:apks        # les deux à la suite
```

### Publication en un coup (local)

Build des deux APK **et** attachement à une Release GitHub (nécessite `gh auth login`) :

```bash
npm run release:apks -- mobile-v1.0.0
```

### Publication via CI

Le workflow [`.github/workflows/release-apk.yml`](../../.github/workflows/release-apk.yml)
fait la même chose automatiquement. Ajoutez les secrets du dépôt
(`Settings → Secrets and variables → Actions`) :

| Secret | Valeur |
|---|---|
| `EXPO_TOKEN` | Token d'accès Expo (expo.dev → Account → Access tokens) |
| `EAS_PROJECT_ID_PARENT` | projectId de `eas init` (Parents) |
| `EAS_PROJECT_ID_CHILD` | projectId de `eas init` (Kids) |

Puis poussez un tag : `git tag mobile-v1.0.0 && git push origin mobile-v1.0.0`
(ou lancez le workflow manuellement depuis l'onglet **Actions**). Les deux APK
(`kidora-parents.apk`, `kidora-kids.apk`) apparaissent dans la Release.

### Installer un APK (sideload)

Sur le téléphone : autoriser « Installer des applications inconnues » pour le
navigateur/gestionnaire de fichiers, télécharger l'APK depuis la Release, puis l'ouvrir.

## Ce qui fonctionne tel quel (Expo Go)

| Fonction | Statut |
|---|---|
| Connexion parent + consultation enfants/alertes | ✅ |
| Enrôlement de l'appareil enfant (jeton) | ✅ |
| Remontée de **localisation** + géofences (alertes serveur) | ✅ (foreground) |
| Réception de l'état `pause` et des commandes | ✅ |

## Ce qui nécessite un build natif (EAS) et des permissions spéciales

Le **contrôle parental profond** est volontairement restreint par les OS mobiles.
Pour égaler un produit commercial, il faut un **dev build** (`eas build`) avec des
modules natifs et des entitlements :

### Android
- **Usage des apps** : permission `PACKAGE_USAGE_STATS` (`UsageStatsManager`) — l'utilisateur
  doit l'accorder manuellement dans les réglages.
- **Blocage d'apps / filtrage** : `AccessibilityService` (superposer un écran de blocage)
  et/ou `DeviceAdmin` / Device Owner pour un verrouillage robuste.
- **Filtrage web** : VPN local (`VpnService`) qui filtre le DNS/HTTP.
- **Localisation en arrière-plan** : `ACCESS_BACKGROUND_LOCATION` + `expo-task-manager`.

### iOS
- **Temps d'écran / blocage d'apps** : framework **FamilyControls + ManagedSettings +
  DeviceActivity** (Screen Time API). Nécessite l'**entitlement `com.apple.developer.family-controls`**
  accordé par Apple, et un build natif (pas Expo Go).
- **Filtrage web** : extension `NEFilterDataProvider` (Network Extension) ou profil MDM.
- Apple interdit la lecture libre de l'usage d'apps tierces hors Screen Time API.

> La logique serveur (politiques, alertes, géofences, commandes) est **déjà prête** ;
> il « suffit » de brancher ces modules natifs côté appareil. Le code `src/api.ts`
> expose déjà `childAgent.sync()` qui accepte `usage`, `webVisits`, `events`, `location`.

## Module natif d'usage des apps (Android)

`modules/app-usage/` est un **module Expo local** (Kotlin) qui lit le temps d'usage
par application via `UsageStatsManager`. Il est utilisé par l'écran *Mode enfant*,
qui envoie les **deltas** d'usage au serveur (`/api/agent/sync`, contrat déjà en place).

- Nécessite un **dev build** (`npx expo run:android` ou `eas build`) — **indisponible dans Expo Go**.
- Permission spéciale `PACKAGE_USAGE_STATS` (« Accès à l'utilisation »), accordée
  manuellement par l'utilisateur ; l'app propose un bouton qui ouvre les réglages.
- Le code JS no-op proprement si le module natif est absent (`isAvailable === false`).

### iOS
`modules/app-usage/ios/AppUsageModule.swift` renvoie « non supporté » : iOS interdit
la lecture libre de l'usage. Le contrôle passe par **FamilyControls + DeviceActivity +
ManagedSettings** (entitlement `com.apple.developer.family-controls` accordé par Apple),
à implémenter dans une extension dédiée.

## Structure

```
app/
  _layout.tsx     # navigation
  index.tsx       # routage selon le rôle enregistré
  login.tsx       # parent (email/mdp) ou enfant (jeton)
  parent.tsx      # liste enfants + alertes
  child-mode.tsx  # agent de localisation
src/
  api.ts          # client serveur (parent + agent enfant)
  storage.ts      # stockage sécurisé (expo-secure-store)
```
