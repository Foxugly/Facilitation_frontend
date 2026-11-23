# Facilitation_frontend

Angular 22 SPA (standalone components, Optimus UI 2, Transloco) for **facilitation.foxugly.com**,
the Collaborative Facilitation Toolbox. It talks to `Facilitation_server` (REST on
`facilitation-api.foxugly.com`, WebSocket on `wss://facilitation-api.foxugly.com/ws/`).
Forked from `Poker_frontend` (see `FORK.md`). Deployment: `deploy/DEPLOY.md` — CI builds the
bundle, ships it via S3, nginx serves it statically and injects the runtime config
(`window.__FACILITATION__`, from SSM via `facilitation-frontend-runtime-fetch`).

UI library: **Optimus UI** (`@openng/optimus-ui`, MIT community fork of PrimeNG 21: same components,
selectors and Aura theme via `@openng/optimus-ui-themes`, `pi pi-*` icons via `@openng/icons`, `provideOptimus`).
**PrimeNG >= 22 is banned in the fleet** (commercial licence key, banner without one); see foxugly-ops
`STANDARD-frontend-layout.md` « Bibliothèque UI ».

## Commands

```bash
npm ci
npm start          # ng serve on http://localhost:4200 (API: http://localhost:8000)
npm test           # Vitest (ng test)
npm run build      # production build -> dist/Facilitation_frontend/browser
npm run e2e        # Playwright; needs the Django backend too (see playwright.config.ts)
```

## Auth: HttpOnly refresh cookie

The refresh token lives in an `HttpOnly; Secure; SameSite=Lax` cookie set by Facilitation_server
(`facilitation_refresh`, `Path=/api/v1/auth/`); JavaScript never sees it. Auth calls only (login,
magic-link verify, email confirm, token refresh, logout, account delete) send
`X-Auth-Mode: cookie` + `withCredentials` (`core/auth/auth-cookie.ts`). The access token and the
user are kept **in memory**: the app initializer (`AuthService.bootstrap()`) restores them via
`token/refresh/` + `me/` when the non-secret `facilitation.session` hint exists (10 s cap). The Web
Lock `facilitation.refresh` serialises refreshes across tabs; `storage` events on the hint mean
"session changed" or "logged out", never a token. A pre-cookie `poker.refresh` (key inherited from
the Poker fork) in local/session storage is presented once in the refresh body, then deleted. The
room WebSocket is unaffected (participant token in `session.join`). Dev uses
`http://localhost:8000` so the cookie is same-site with `ng serve`. E2E `auth-cookie.spec.ts` runs
against the real backend (`FACILITATION_SERVER_DIR`, `FACILITATION_PYTHON` to point at another
checkout).
