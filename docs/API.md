# API Kidora

Base : `/api`. Réponses JSON. Erreurs : `{ "error": "message" }` + code HTTP.

## Authentification

| Méthode | Route | Corps | Description |
|---|---|---|---|
| POST | `/auth/register` | `{name,email,password}` | Crée un parent, pose le cookie, renvoie `token` |
| POST | `/auth/login` | `{email,password}` | Connexion, renvoie `token` |
| POST | `/auth/logout` | — | Supprime le cookie |
| GET | `/auth/me` | — | Parent courant |

Auth : cookie `kidora_session` (web) **ou** en-tête `Cookie: kidora_session=<token>` (mobile).

## Enfants & règles (parent)

| Méthode | Route | Description |
|---|---|---|
| GET / POST | `/children` | Lister / créer un enfant |
| GET / PATCH / DELETE | `/children/:id` | Détail / modifier / supprimer |
| POST | `/children/:id/pause` `{paused}` | Pause/reprise + commande |
| GET / POST | `/children/:id/devices` | Lister / créer un appareil (renvoie `enrollToken`) |
| GET / PUT / DELETE | `/children/:id/rules/apps` | Règles d'application (upsert/suppr.) |
| GET / POST / DELETE | `/children/:id/rules/web` | Règles de domaine |
| GET / PUT | `/children/:id/screentime` | Limites & coucher |
| PUT | `/children/:id/webfilter` | SafeSearch, catégories bloquées |
| GET | `/children/:id/activity` | Timeline d'événements |
| GET | `/children/:id/usage?days=7` | Usage par app + tendance |
| GET | `/children/:id/location` | Positions + géofences |
| GET / POST | `/children/:id/commands` | Commandes vers l'appareil |
| GET / PATCH | `/alerts` | Alertes / marquer lues |

## API Agent (appareil — `Authorization: Bearer <enrollToken>`)

### `POST /agent/enroll`
```jsonc
// req
{ "enrollToken": "…", "deviceInfo": { "hostname": "PC", "agentVersion": "1.0.0" } }
// res
{ "deviceId": "…", "childName": "Lucas", "policy": { … }, "syncIntervalSeconds": 30 }
```

### `POST /agent/sync`
```jsonc
// req — tous les champs optionnels
{
  "online": true,
  "battery": 95,
  "usage":   [{ "appId": "chrome.exe", "appName": "Chrome", "date": "2026-06-29", "seconds": 120 }],
  "events":  [{ "type": "blocked", "title": "pornhub.com", "blocked": true }],
  "webVisits": [{ "domain": "youtube.com", "blocked": false }],
  "location": { "lat": 48.85, "lng": 2.35, "accuracy": 10 },
  "commandResults": [{ "id": "…", "status": "done" }]
}
// res
{ "policy": { … }, "commands": [{ "id": "…", "type": "lock", "payload": {} }] }
```

Le serveur génère automatiquement des **alertes** (tentatives bloquées, nouvelles
apps, limites, transitions de géofence) à partir de la télémétrie.

### `GET /agent/policy`
Renvoie la politique courante `{ "policy": { … } }`.
