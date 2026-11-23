import { ErrorHandler, Injectable } from '@angular/core';

import { getRuntimeConfig } from './runtime-config';
import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

type SentryModule = typeof import('@sentry/angular');

// Sentry is loaded lazily (dynamic import) so the SDK stays out of the initial
// bundle. It is enabled only when a DSN is injected (prod, from
// /facilitation-frontend/prod via window.__FACILITATION__) — dev/ng serve has no
// DSN, so nothing is loaded there. Error reporting only: no browser tracing
// (would add sentry-trace/baggage headers to cross-origin API calls, which the
// API's CORS would then have to allow-list).
let sentryReady: Promise<SentryModule> | null = null;

export function initSentry(): void {
  const { sentry } = getRuntimeConfig();
  if (!sentry.dsn || sentryReady) {
    return;
  }
  sentryReady = import('@sentry/angular').then((Sentry) => {
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
    return Sentry;
  });
  // A failed chunk load must not surface as an unhandled rejection.
  sentryReady.catch(() => undefined);
}

/**
 * Logs unhandled Angular errors to the console right away and forwards them to
 * Sentry once the SDK is loaded (errors raised before that are queued on the
 * import promise). Without a DSN it only logs, like Angular's default handler.
 */
@Injectable()
export class LazySentryErrorHandler implements ErrorHandler {
  private delegate: ErrorHandler | null = null;

  handleError(error: unknown): void {
    console.error(error);
    sentryReady
      ?.then((Sentry) => {
        this.delegate ??= Sentry.createErrorHandler({ logErrors: false });
        this.delegate.handleError(error);
      })
      .catch(() => undefined);
  }
}
