/**
 * Strips URL-borne secrets from Sentry events (audit F-M1).
 *
 * The one-time tokens of `auth/confirm-email/:uid/:token`,
 * `auth/reset-password/:uid/:token`, `auth/magic-link/:token` and
 * `teams/join/:token` live in the PATH, and so does the room code
 * (`/room/:code`, `/join/:code`, API `/api/v1/rooms/:code`, WS `/ws/rooms/:code/`),
 * which is enough to join an anonymous room. Without a filter they would reach
 * Sentry in `request.url`, the transaction name, breadcrumbs and spans. The
 * `returnUrl` query parameter carries such a path (auth guard), and
 * `uid` / `token` / `code` query parameters are masked wherever they appear.
 */
import type { Breadcrumb, Event } from '@sentry/angular';

export const FILTERED = '[Filtered]';

// Everything after the prefix up to the query / fragment is masked.
const SENSITIVE_PATH = /(\/(?:confirm-email|reset-password|magic-link|join|room|rooms)\/)[^?#\s"']+/gi;
const SENSITIVE_QUERY = /([?&](?:uid|token|code|returnUrl)=)[^&#\s"']*/gi;

/** Masks the sensitive segments / parameters of a string containing a URL. */
export function scrubUrl(value: string): string;
export function scrubUrl(value: string | undefined): string | undefined;
export function scrubUrl(value: string | undefined): string | undefined {
  if (!value) return value;
  return value
    .replace(SENSITIVE_PATH, (_m, prefix: string) => `${prefix}${FILTERED}`)
    .replace(SENSITIVE_QUERY, (_m, prefix: string) => `${prefix}${FILTERED}`);
}

function scrubRecordUrls(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  for (const key of ['url', 'from', 'to', 'http.url', 'http.query']) {
    const value = data[key];
    if (typeof value === 'string') data[key] = scrubUrl(value);
  }
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  scrubRecordUrls(breadcrumb.data);
  if (breadcrumb.message) breadcrumb.message = scrubUrl(breadcrumb.message);
  return breadcrumb;
}

/** Cleans the fields shared by errors and transactions. */
export function scrubEvent<T extends Event>(event: T): T {
  if (event.request) {
    event.request.url = scrubUrl(event.request.url);
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = scrubUrl(`?${event.request.query_string}`).slice(1);
    }
    const headers = event.request.headers;
    if (headers?.['Referer']) headers['Referer'] = scrubUrl(headers['Referer']);
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  event.breadcrumbs?.forEach(scrubBreadcrumb);
  for (const span of event.spans ?? []) {
    if (span.description) span.description = scrubUrl(span.description);
    scrubRecordUrls(span.data as Record<string, unknown> | undefined);
  }
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubUrl(ex.value);
  }
  if (event.message) event.message = scrubUrl(event.message);
  scrubRecordUrls(event.contexts?.trace?.data as Record<string, unknown> | undefined);
  return event;
}
