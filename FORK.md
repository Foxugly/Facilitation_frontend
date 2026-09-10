# Fork de Poker_frontend → Facilitation_frontend

Copie de `Foxugly/Poker_frontend` @ main. **Poker_frontend n'est pas modifié.**
Seule l'identité d'infrastructure a changé. Aucun composant, aucun service,
aucune route n'a été touché.

## Ce qui a été renommé

| Avant | Après |
|---|---|
| `poker.foxugly.com` / `poker-api.foxugly.com` | `facilitation…` |
| `window.__POKER__` | `window.__FACILITATION__` |
| localStorage `poker.username` / `poker.session` | `facilitation.*` |
| projet angular.json `Poker_frontend` | `Facilitation_frontend` |
| package.json `poker-frontend` | `facilitation-frontend` |
| SSM `/poker-frontend/` | `/facilitation-frontend/` |
| `deploy/nginx/poker-frontend.conf` | `facilitation-frontend.conf` |
| `poker-frontend-runtime-fetch.service` | `facilitation-frontend-runtime-fetch.service` |
| `<title>Poker</title>` | `<title>Facilitation</title>` |

Le changement des clés localStorage est délibéré : sans lui, les deux applications
se marchent dessus quand elles tournent toutes les deux sur `localhost`.

## Laissé intact, volontairement

`public/i18n/*.json` et les textes produit (home, about, privacy, pricing).
Réécrire la copie « Delegation Poker » en « Collaborative Facilitation Toolbox »
est une décision produit, et la refonte de la home est déjà au programme.

Les composants `shared/ui/delegation-*` restent tels quels : ce sont les composants
visuels de l'activité Delegation Poker.

## Non vérifié

Le build et les tests front n'ont pas été lancés (pas de `npm install` ici).
`npm ci && npm run build && npm test` avant le premier push.

## À faire

1. `deploy/nginx/facilitation-frontend.conf` injecte `window.__FACILITATION__` —
   vérifier que le script d'injection a bien suivi le renommage.
2. Paramètres SSM `/facilitation-frontend/prod/*`.
3. Clé Turnstile propre au nouveau domaine.

## Pousser vers GitHub

```
cd Facilitation_frontend
git remote add origin https://github.com/Foxugly/Facilitation_frontend.git
git push -u origin main
```
