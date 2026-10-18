import { describe, expect, it } from 'vitest';
import type { Event } from '@sentry/angular';

import { FILTERED, scrubBreadcrumb, scrubEvent, scrubUrl } from './sentry-scrub';

describe('scrubUrl', () => {
  it.each([
    ['https://x.test/auth/reset-password/MQ/abc-123', `https://x.test/auth/reset-password/${FILTERED}`],
    ['https://x.test/auth/confirm-email/MQ/abc-123?x=1', `https://x.test/auth/confirm-email/${FILTERED}?x=1`],
    ['/auth/magic-link/tok', `/auth/magic-link/${FILTERED}`],
    ['/teams/join/invite-tok', `/teams/join/${FILTERED}`],
    ['/room/ABC234', `/room/${FILTERED}`],
    ['/join/ABC234', `/join/${FILTERED}`],
    ['https://api.test/api/v1/rooms/ABC234/join', `https://api.test/api/v1/rooms/${FILTERED}`],
    ['wss://api.test/ws/rooms/ABC234/', `wss://api.test/ws/rooms/${FILTERED}`],
    ['/login?returnUrl=%2Fteams%2Fjoin%2Ftok', `/login?returnUrl=${FILTERED}`],
    ['/x?uid=1&token=t&code=c', `/x?uid=${FILTERED}&token=${FILTERED}&code=${FILTERED}`],
  ])('%s', (input, expected) => {
    expect(scrubUrl(input)).toBe(expected);
  });

  it('leaves URLs without secrets alone', () => {
    for (const url of ['/home', '/join', 'https://api.test/api/v1/rooms', '/api/v1/auth/magic-link/', '/teams/4']) {
      expect(scrubUrl(url)).toBe(url);
    }
  });
});

describe('scrubEvent / scrubBreadcrumb', () => {
  it('masks request, transaction, breadcrumbs and exception text', () => {
    const event = scrubEvent({
      request: { url: 'https://p.test/auth/magic-link/secret', headers: { Referer: 'https://p.test/room/ABC234' } },
      transaction: '/teams/join/secret',
      breadcrumbs: [{ category: 'navigation', data: { from: '/room/ABC234', to: '/auth/reset-password/MQ/t' } }],
      exception: { values: [{ type: 'HttpErrorResponse', value: 'failure for https://api.test/api/v1/rooms/ABC234' }] },
    } as Event);
    const text = JSON.stringify(event);
    expect(text).not.toContain('secret');
    expect(text).not.toContain('ABC234');
    expect(text).not.toContain('MQ/t');
  });

  it('masks a breadcrumb message', () => {
    expect(scrubBreadcrumb({ message: 'GET /api/v1/rooms/ABC234' }).message).toBe(`GET /api/v1/rooms/${FILTERED}`);
  });
});
