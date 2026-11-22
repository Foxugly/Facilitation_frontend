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

## Mise en production — faite

Build et tests passent en CI à chaque push ; l'injection `window.__FACILITATION__`
(`deploy/nginx/facilitation-frontend.conf`), les paramètres SSM `/facilitation-frontend/prod/*`
et la clé Turnstile du domaine sont en place — le site est en prod
(`facilitation.foxugly.com`). Ce document est conservé comme trace du fork.
