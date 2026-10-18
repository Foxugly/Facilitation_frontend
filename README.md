# PokerFrontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.8.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

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
