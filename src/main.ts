import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';

import { appConfig } from './app/app.config';
import { App } from './app/app';
import { getRuntimeConfig } from './app/core/runtime-config';
import { scrubBreadcrumb, scrubEvent } from './app/core/sentry-scrub';

// Sentry is enabled only when a DSN is injected (prod, from /facilitation-frontend/prod
// via window.__FACILITATION__) — dev/ng serve has no DSN, so this is a no-op there.
// Error reporting only: no browser tracing (would add sentry-trace/baggage headers
// to cross-origin API calls, which the API's CORS would then have to allow-list).
const { sentry } = getRuntimeConfig();
if (sentry.dsn) {
  Sentry.init({
    dsn: sentry.dsn,
    environment: sentry.environment,
    release: sentry.release || undefined,
    sendDefaultPii: false,
    // One-time tokens (reset / confirm-email / magic-link / team invite) and room
    // codes are masked in URLs, messages and breadcrumbs (sentry-scrub.ts).
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
