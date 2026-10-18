import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getRuntimeConfig } from '../runtime-config';
import { isPublicAuthEndpoint } from './auth-endpoints';
import { authInterceptor } from './auth.interceptor';
import { ACCESS_KEY, AuthService, REFRESH_KEY } from './auth.service';

const api = getRuntimeConfig().apiBaseUrl;
const auth = `${api}/api/v1/auth`;

/** Lets the refresh promise chain (lock + firstValueFrom) reach the next request. */
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
  });
  return {
    http: TestBed.inject(HttpClient),
    ctrl: TestBed.inject(HttpTestingController),
    service: TestBed.inject(AuthService),
  };
}

describe('isPublicAuthEndpoint', () => {
  it('matches the real /api/v1/auth/ URLs (the old /api/auth/ regex never did)', () => {
    expect(isPublicAuthEndpoint(`${auth}/token/refresh/`)).toBe(true);
    expect(isPublicAuthEndpoint(`${auth}/login/`)).toBe(true);
    expect(isPublicAuthEndpoint(`${auth}/magic-link/verify/`)).toBe(true);
    expect(isPublicAuthEndpoint(`${auth}/email/confirm/`)).toBe(true);
  });
  it('leaves the authenticated auth endpoints and other APIs out', () => {
    expect(isPublicAuthEndpoint(`${auth}/me/`)).toBe(false);
    expect(isPublicAuthEndpoint(`${auth}/account/delete/`)).toBe(false);
    expect(isPublicAuthEndpoint(`${auth}/logout/`)).toBe(false);
    expect(isPublicAuthEndpoint(`${api}/api/v1/teams/`)).toBe(false);
  });
});

describe('authInterceptor', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(ACCESS_KEY, 'old-access');
    localStorage.setItem(REFRESH_KEY, 'old-refresh');
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
  });

  it('attaches the Bearer to API calls but not to anonymous auth endpoints', () => {
    const { http, ctrl } = setup();
    http.get(`${api}/api/v1/teams/`).subscribe();
    http.post(`${auth}/login/`, {}).subscribe();
    expect(ctrl.expectOne(`${api}/api/v1/teams/`).request.headers.get('Authorization')).toBe('Bearer old-access');
    expect(ctrl.expectOne(`${auth}/login/`).request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes once on a 401, persists the rotated pair and retries', async () => {
    const { http, ctrl } = setup();
    const result = firstValueFrom(http.get(`${api}/api/v1/teams/`));
    ctrl.expectOne(`${api}/api/v1/teams/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    const refresh = ctrl.expectOne(`${auth}/token/refresh/`);
    expect(refresh.request.body).toEqual({ refresh: 'old-refresh' });
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush({ access: 'new-access', refresh: 'new-refresh' });
    await flush();
    const retry = ctrl.expectOne(`${api}/api/v1/teams/`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-access');
    retry.flush([]);
    await expect(result).resolves.toEqual([]);
    expect(localStorage.getItem(REFRESH_KEY)).toBe('new-refresh');
  });

  it('a 401 from token/refresh/ clears the session once — no refresh loop', async () => {
    const { http, ctrl, service } = setup();
    const result = firstValueFrom(http.get(`${api}/api/v1/teams/`));
    ctrl.expectOne(`${api}/api/v1/teams/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    ctrl.expectOne(`${auth}/token/refresh/`).flush({ code: 'token_not_valid' }, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toMatchObject({ status: 401 });
    await flush();
    ctrl.expectNone(`${auth}/token/refresh/`);
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(service.currentUser()).toBeNull();
  });

  it.each([0, 502])('a %s from token/refresh/ keeps the tokens', async (status) => {
    const { http, ctrl } = setup();
    const result = firstValueFrom(http.get(`${api}/api/v1/teams/`));
    ctrl.expectOne(`${api}/api/v1/teams/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    ctrl.expectOne(`${auth}/token/refresh/`).flush(null, { status, statusText: 'Bad Gateway' });
    await expect(result).rejects.toMatchObject({ status });
    expect(localStorage.getItem(REFRESH_KEY)).toBe('old-refresh');
    expect(localStorage.getItem(ACCESS_KEY)).toBe('old-access');
  });

  it('concurrent 401s share a single refresh', async () => {
    const { http, ctrl } = setup();
    const a = firstValueFrom(http.get(`${api}/api/v1/a/`));
    const b = firstValueFrom(http.get(`${api}/api/v1/b/`));
    ctrl.expectOne(`${api}/api/v1/a/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${api}/api/v1/b/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    ctrl.expectOne(`${auth}/token/refresh/`).flush({ access: 'new-access', refresh: 'new-refresh' });
    await flush();
    ctrl.expectOne(`${api}/api/v1/a/`).flush(1);
    ctrl.expectOne(`${api}/api/v1/b/`).flush(2);
    await expect(Promise.all([a, b])).resolves.toEqual([1, 2]);
  });

  it('adopts a refresh token another tab rotated while we waited for the lock', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const locks = { request: async (_name: string, task: () => Promise<unknown>) => { await gate; return task(); } };
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    try {
      const { ctrl, service } = setup();
      const pending = service.refresh(); // holds 'old-refresh', waits for the lock
      // Another tab (holding the lock) rotates the pair, then releases it.
      localStorage.setItem(ACCESS_KEY, 'tab-b-access');
      localStorage.setItem(REFRESH_KEY, 'tab-b-refresh');
      release();
      await expect(pending).resolves.toBe('tab-b-access');
      ctrl.expectNone(`${auth}/token/refresh/`);
    } finally {
      delete (navigator as { locks?: unknown }).locks;
    }
  });

  it('does not retry a 401 on the retried request', async () => {
    const { http, ctrl } = setup();
    const result = firstValueFrom(http.get(`${api}/api/v1/teams/`));
    ctrl.expectOne(`${api}/api/v1/teams/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    ctrl.expectOne(`${auth}/token/refresh/`).flush({ access: 'new-access', refresh: 'new-refresh' });
    await flush();
    ctrl.expectOne(`${api}/api/v1/teams/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toMatchObject({ status: 401 });
    await flush();
    ctrl.expectNone(`${auth}/token/refresh/`);
  });
});
