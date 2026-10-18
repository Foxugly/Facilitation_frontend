import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getRuntimeConfig } from '../runtime-config';
import { isPublicAuthEndpoint } from './auth-endpoints';
import { authInterceptor } from './auth.interceptor';
import { AuthService, SESSION_HINT_KEY } from './auth.service';
import { AuthUser } from './auth.models';

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
    // Cookie-only: an expired access token must not turn the logout into a 401.
    expect(isPublicAuthEndpoint(`${auth}/logout/`)).toBe(true);
  });
  it('leaves the authenticated auth endpoints and other APIs out', () => {
    expect(isPublicAuthEndpoint(`${auth}/me/`)).toBe(false);
    expect(isPublicAuthEndpoint(`${auth}/account/delete/`)).toBe(false);
    expect(isPublicAuthEndpoint(`${api}/api/v1/teams/`)).toBe(false);
  });
});

describe('authInterceptor', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
  });

  /** Signed in with 'old-access' in memory (the refresh is in the HttpOnly cookie). */
  async function signedIn() {
    const ctx = setup();
    const login = ctx.service.login('a@b.c', 'pw');
    ctx.ctrl.expectOne(`${auth}/login/`).flush({ access: 'old-access', user: { id: 1 } as AuthUser });
    await login;
    return ctx;
  }

  it('attaches the Bearer to API calls, without credentials, but not to anonymous auth endpoints', async () => {
    const { http, ctrl } = await signedIn();
    http.get(`${api}/api/v1/teams/`).subscribe();
    http.post(`${auth}/login/`, {}).subscribe();
    const teams = ctrl.expectOne(`${api}/api/v1/teams/`);
    expect(teams.request.headers.get('Authorization')).toBe('Bearer old-access');
    expect(teams.request.withCredentials).toBe(false);
    expect(teams.request.headers.has('X-Auth-Mode')).toBe(false);
    expect(ctrl.expectOne(`${auth}/login/`).request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes once on a 401 through the cookie and retries with the new access token', async () => {
    const { http, ctrl, service } = await signedIn();
    const result = firstValueFrom(http.get(`${api}/api/v1/teams/`));
    ctrl.expectOne(`${api}/api/v1/teams/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    const refresh = ctrl.expectOne(`${auth}/token/refresh/`);
    expect(refresh.request.body).toEqual({});
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.get('X-Auth-Mode')).toBe('cookie');
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush({ access: 'new-access' });
    await flush();
    const retry = ctrl.expectOne(`${api}/api/v1/teams/`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-access');
    expect(retry.request.withCredentials).toBe(false);
    retry.flush([]);
    await expect(result).resolves.toEqual([]);
    expect(service.accessToken).toBe('new-access');
  });

  it('a 401 from token/refresh/ clears the session once — no refresh loop', async () => {
    const { http, ctrl, service } = await signedIn();
    const result = firstValueFrom(http.get(`${api}/api/v1/teams/`));
    ctrl.expectOne(`${api}/api/v1/teams/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    ctrl.expectOne(`${auth}/token/refresh/`).flush({ code: 'token_not_valid' }, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toMatchObject({ status: 401 });
    await flush();
    ctrl.expectNone(`${auth}/token/refresh/`);
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    expect(service.currentUser()).toBeNull();
  });

  it.each([0, 502])('a %s from token/refresh/ keeps the session', async (status) => {
    const { http, ctrl, service } = await signedIn();
    const result = firstValueFrom(http.get(`${api}/api/v1/teams/`));
    ctrl.expectOne(`${api}/api/v1/teams/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    ctrl.expectOne(`${auth}/token/refresh/`).flush(null, { status, statusText: 'Bad Gateway' });
    await expect(result).rejects.toMatchObject({ status });
    expect(localStorage.getItem(SESSION_HINT_KEY)).not.toBeNull();
    expect(service.accessToken).toBe('old-access');
  });

  it('concurrent 401s share a single refresh', async () => {
    const { http, ctrl } = await signedIn();
    const a = firstValueFrom(http.get(`${api}/api/v1/a/`));
    const b = firstValueFrom(http.get(`${api}/api/v1/b/`));
    ctrl.expectOne(`${api}/api/v1/a/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${api}/api/v1/b/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    ctrl.expectOne(`${auth}/token/refresh/`).flush({ access: 'new-access' });
    await flush();
    ctrl.expectOne(`${api}/api/v1/a/`).flush(1);
    ctrl.expectOne(`${api}/api/v1/b/`).flush(2);
    await expect(Promise.all([a, b])).resolves.toEqual([1, 2]);
  });

  it('an anonymous 401 (no session) is not refreshed', async () => {
    const { http, ctrl } = setup();
    const result = firstValueFrom(http.get(`${api}/api/v1/teams/`));
    ctrl.expectOne(`${api}/api/v1/teams/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toMatchObject({ status: 401 });
    ctrl.expectNone(`${auth}/token/refresh/`);
  });

  it('does not retry a 401 on the retried request', async () => {
    const { http, ctrl } = await signedIn();
    const result = firstValueFrom(http.get(`${api}/api/v1/teams/`));
    ctrl.expectOne(`${api}/api/v1/teams/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flush();
    ctrl.expectOne(`${auth}/token/refresh/`).flush({ access: 'new-access' });
    await flush();
    ctrl.expectOne(`${api}/api/v1/teams/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toMatchObject({ status: 401 });
    await flush();
    ctrl.expectNone(`${auth}/token/refresh/`);
  });
});
