import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getRuntimeConfig } from '../runtime-config';
import { authInterceptor } from './auth.interceptor';
import { ACCESS_KEY, AuthService, REFRESH_KEY } from './auth.service';
import { AuthUser } from './auth.models';

const auth = `${getRuntimeConfig().apiBaseUrl}/api/v1/auth`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const user = { id: 1, email: 'a@b.c', display_name: 'A' } as AuthUser;

/** A JWT-shaped token whose payload carries `exp` (seconds). */
function jwt(exp: number): string {
  return `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.s`;
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
  });
  return { ctrl: TestBed.inject(HttpTestingController), service: TestBed.inject(AuthService) };
}

describe('AuthService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
  });

  it('logout blacklists the refresh server-side, then clears the local session', async () => {
    localStorage.setItem(ACCESS_KEY, jwt(Date.now() / 1000 + 600));
    localStorage.setItem(REFRESH_KEY, 'r1');
    const { ctrl, service } = setup();
    service.currentUser.set(user);
    const done = service.logout();
    const req = ctrl.expectOne(`${auth}/logout/`);
    expect(req.request.body).toEqual({ refresh: 'r1' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await done;
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(service.currentUser()).toBeNull();
  });

  it('logout still clears locally when the server call fails, and never refreshes on its 401', async () => {
    localStorage.setItem(ACCESS_KEY, jwt(Date.now() / 1000 + 600));
    localStorage.setItem(REFRESH_KEY, 'r1');
    const { ctrl, service } = setup();
    const done = service.logout();
    ctrl.expectOne(`${auth}/logout/`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await done;
    ctrl.expectNone(`${auth}/token/refresh/`);
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('logout with an expired access refreshes first, then logs out with the rotated refresh', async () => {
    localStorage.setItem(ACCESS_KEY, jwt(Date.now() / 1000 - 60));
    localStorage.setItem(REFRESH_KEY, 'r1');
    const { ctrl, service } = setup();
    const done = service.logout();
    await flush();
    ctrl.expectOne(`${auth}/token/refresh/`).flush({ access: jwt(Date.now() / 1000 + 600), refresh: 'r2' });
    await flush();
    const req = ctrl.expectOne(`${auth}/logout/`);
    expect(req.request.body).toEqual({ refresh: 'r2' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await done;
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('a storage event without refresh token (logout in another tab) drops currentUser', () => {
    localStorage.setItem(REFRESH_KEY, 'r1');
    const { service } = setup();
    service.currentUser.set(user);
    localStorage.removeItem(REFRESH_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: REFRESH_KEY }));
    expect(service.currentUser()).toBeNull();
  });

  it('a storage event with a new session (login in another tab) loads the user', async () => {
    const { ctrl, service } = setup();
    localStorage.setItem(ACCESS_KEY, 'a');
    localStorage.setItem(REFRESH_KEY, 'r1');
    window.dispatchEvent(new StorageEvent('storage', { key: REFRESH_KEY }));
    ctrl.expectOne(`${auth}/me/`).flush(user);
    await flush();
    expect(service.currentUser()).toEqual(user);
  });

  it('deleteAccount posts the password and drops the session on 204', async () => {
    localStorage.setItem(ACCESS_KEY, 'a');
    localStorage.setItem(REFRESH_KEY, 'r1');
    const { ctrl, service } = setup();
    service.currentUser.set(user);
    const done = service.deleteAccount('pw');
    const req = ctrl.expectOne(`${auth}/account/delete/`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ current_password: 'pw' });
    expect(req.request.headers.get('Authorization')).toBe('Bearer a');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await done;
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(service.currentUser()).toBeNull();
  });

  it('deleteAccount keeps the session on an error', async () => {
    localStorage.setItem(ACCESS_KEY, 'a');
    localStorage.setItem(REFRESH_KEY, 'r1');
    const { ctrl, service } = setup();
    const done = service.deleteAccount('bad');
    ctrl.expectOne(`${auth}/account/delete/`).flush({ code: 'current_password_invalid' }, { status: 400, statusText: 'Bad Request' });
    await expect(done).rejects.toMatchObject({ status: 400 });
    expect(localStorage.getItem(REFRESH_KEY)).toBe('r1');
  });

  it('bootstrap keeps the tokens when the API is unreachable', async () => {
    localStorage.setItem(ACCESS_KEY, 'a');
    localStorage.setItem(REFRESH_KEY, 'r1');
    const { ctrl, service } = setup();
    const done = service.bootstrap();
    ctrl.expectOne(`${auth}/me/`).flush(null, { status: 502, statusText: 'Bad Gateway' });
    await done;
    expect(localStorage.getItem(REFRESH_KEY)).toBe('r1');
  });
});
