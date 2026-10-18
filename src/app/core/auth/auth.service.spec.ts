import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeConfig } from '../runtime-config';
import { authInterceptor } from './auth.interceptor';
import { AuthService, LEGACY_ACCESS_KEY, LEGACY_REFRESH_KEY, RESTORE_TIMEOUT_MS, SESSION_HINT_KEY } from './auth.service';
import { AuthUser } from './auth.models';

const auth = `${getRuntimeConfig().apiBaseUrl}/api/v1/auth`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const user = { id: 1, email: 'a@b.c', display_name: 'A' } as AuthUser;

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
  });
  return { ctrl: TestBed.inject(HttpTestingController), service: TestBed.inject(AuthService) };
}

/** Every token key the pre-cookie SPA used, plus anything that looks like a JWT. */
function storageHoldsNoToken(): boolean {
  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)!;
      if (key === LEGACY_ACCESS_KEY || key === LEGACY_REFRESH_KEY) return false;
      if ((store.getItem(key) ?? '').split('.').length === 3) return false;
    }
  }
  return true;
}

function expectCookieOptIn(req: { request: { headers: { get(n: string): string | null }; withCredentials: boolean } }) {
  expect(req.request.headers.get('X-Auth-Mode')).toBe('cookie');
  expect(req.request.withCredentials).toBe(true);
}

describe('AuthService (HttpOnly refresh cookie)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('login / magic link / email confirm', () => {
    it('login opts into the cookie, forwards remember_me and keeps the access token in memory only', async () => {
      const { ctrl, service } = setup();
      const done = service.login('a@b.c', 'pw', false);
      const req = ctrl.expectOne(`${auth}/login/`);
      expectCookieOptIn(req);
      expect(req.request.body).toEqual({ email: 'a@b.c', password: 'pw', remember_me: false });
      req.flush({ access: 'acc', user });
      await done;
      expect(service.accessToken).toBe('acc');
      expect(service.currentUser()).toEqual(user);
      expect(localStorage.getItem(SESSION_HINT_KEY)).not.toBeNull();
      expect(storageHoldsNoToken()).toBe(true);
    });

    it('verifyMagicLink and confirmEmail opt into the cookie', async () => {
      const { ctrl, service } = setup();
      const magic = service.verifyMagicLink('tok');
      const m = ctrl.expectOne(`${auth}/magic-link/verify/`);
      expectCookieOptIn(m);
      m.flush({ access: 'a1', user });
      await magic;
      const confirm = service.confirmEmail('uid', 'tok');
      const c = ctrl.expectOne(`${auth}/email/confirm/`);
      expectCookieOptIn(c);
      c.flush({ access: 'a2', user });
      await confirm;
      expect(service.accessToken).toBe('a2');
      expect(storageHoldsNoToken()).toBe(true);
    });

    it('a login drops any legacy token left in storage', async () => {
      localStorage.setItem(LEGACY_REFRESH_KEY, 'old');
      sessionStorage.setItem(LEGACY_ACCESS_KEY, 'old-a');
      const { ctrl, service } = setup();
      const done = service.login('a@b.c', 'pw');
      ctrl.expectOne(`${auth}/login/`).flush({ access: 'acc', user });
      await done;
      expect(storageHoldsNoToken()).toBe(true);
    });
  });

  describe('bootstrap (silent restore)', () => {
    it('does nothing for an anonymous visitor (no hint, no legacy token)', async () => {
      const { ctrl, service } = setup();
      await service.bootstrap();
      ctrl.expectNone(`${auth}/token/refresh/`);
      expect(service.currentUser()).toBeNull();
    });

    it('refreshes through the cookie then loads me/ with the new access token', async () => {
      localStorage.setItem(SESSION_HINT_KEY, '1');
      const { ctrl, service } = setup();
      const done = service.bootstrap();
      await flush();
      const refresh = ctrl.expectOne(`${auth}/token/refresh/`);
      expectCookieOptIn(refresh);
      expect(refresh.request.body).toEqual({});
      expect(refresh.request.headers.has('Authorization')).toBe(false);
      refresh.flush({ access: 'fresh' });
      await flush();
      const me = ctrl.expectOne(`${auth}/me/`);
      expect(me.request.headers.get('Authorization')).toBe('Bearer fresh');
      expect(me.request.withCredentials).toBe(false);
      me.flush(user);
      await done;
      expect(service.currentUser()).toEqual(user);
      expect(storageHoldsNoToken()).toBe(true);
    });

    it.each([401, 403])('a %s from refresh ends the session', async (status) => {
      localStorage.setItem(SESSION_HINT_KEY, '1');
      const { ctrl, service } = setup();
      const done = service.bootstrap();
      await flush();
      ctrl.expectOne(`${auth}/token/refresh/`).flush({ code: 'token_not_valid' }, { status, statusText: 'x' });
      await done;
      expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
      expect(service.currentUser()).toBeNull();
    });

    it.each([0, 502])('a %s from refresh keeps the hint for the next load', async (status) => {
      localStorage.setItem(SESSION_HINT_KEY, '1');
      const { ctrl, service } = setup();
      const done = service.bootstrap();
      await flush();
      ctrl.expectOne(`${auth}/token/refresh/`).flush(null, { status, statusText: 'Bad Gateway' });
      await done;
      expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
      expect(service.currentUser()).toBeNull();
      expect(service.accessToken).toBeNull();
    });

    it('gives up after the restore timeout without throwing', async () => {
      vi.useFakeTimers();
      try {
        localStorage.setItem(SESSION_HINT_KEY, '1');
        const { ctrl, service } = setup();
        const done = service.bootstrap();
        await vi.advanceTimersByTimeAsync(RESTORE_TIMEOUT_MS + 1);
        await expect(done).resolves.toBeUndefined();
        expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
        ctrl.match(`${auth}/token/refresh/`); // the hung request, discarded
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('legacy migration', () => {
    it.each([
      ['localStorage', () => localStorage],
      ['sessionStorage', () => sessionStorage],
    ])('presents a %s refresh token once in the body, then deletes it', async (_name, store) => {
      store().setItem(LEGACY_ACCESS_KEY, 'old-a');
      store().setItem(LEGACY_REFRESH_KEY, 'old-r');
      const { ctrl, service } = setup();
      const done = service.bootstrap();
      await flush();
      const refresh = ctrl.expectOne(`${auth}/token/refresh/`);
      expectCookieOptIn(refresh);
      expect(refresh.request.body).toEqual({ refresh: 'old-r' });
      refresh.flush({ access: 'fresh' });
      await flush();
      ctrl.expectOne(`${auth}/me/`).flush(user);
      await done;
      expect(storageHoldsNoToken()).toBe(true);
      expect(localStorage.getItem(SESSION_HINT_KEY)).not.toBeNull();
      expect(service.currentUser()).toEqual(user);
    });

    it('deletes a rejected legacy token', async () => {
      localStorage.setItem(LEGACY_REFRESH_KEY, 'old-r');
      const { ctrl, service } = setup();
      const done = service.bootstrap();
      await flush();
      ctrl.expectOne(`${auth}/token/refresh/`).flush(null, { status: 401, statusText: 'Unauthorized' });
      await done;
      expect(storageHoldsNoToken()).toBe(true);
    });

    it('keeps the legacy token on a network error', async () => {
      localStorage.setItem(LEGACY_REFRESH_KEY, 'old-r');
      const { ctrl, service } = setup();
      const done = service.bootstrap();
      await flush();
      ctrl.expectOne(`${auth}/token/refresh/`).flush(null, { status: 0, statusText: 'Unknown Error' });
      await done;
      expect(localStorage.getItem(LEGACY_REFRESH_KEY)).toBe('old-r');
    });
  });

  describe('refresh', () => {
    it('concurrent callers share one request', async () => {
      localStorage.setItem(SESSION_HINT_KEY, '1');
      const { ctrl, service } = setup();
      const a = service.refresh();
      const b = service.refresh();
      await flush();
      ctrl.expectOne(`${auth}/token/refresh/`).flush({ access: 'x' });
      await expect(Promise.all([a, b])).resolves.toEqual(['x', 'x']);
    });

    it('runs under the cross-tab Web Lock', async () => {
      const request = vi.fn(async (_name: string, task: () => Promise<unknown>) => task());
      Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
      try {
        localStorage.setItem(SESSION_HINT_KEY, '1');
        const { ctrl, service } = setup();
        const pending = service.refresh();
        await flush();
        ctrl.expectOne(`${auth}/token/refresh/`).flush({ access: 'x' });
        await expect(pending).resolves.toBe('x');
        expect(request).toHaveBeenCalledWith('facilitation.refresh', expect.any(Function));
      } finally {
        delete (navigator as { locks?: unknown }).locks;
      }
    });

    it('resolves null without a call when there is no session', async () => {
      const { ctrl, service } = setup();
      await expect(service.refresh()).resolves.toBeNull();
      ctrl.expectNone(`${auth}/token/refresh/`);
    });
  });

  describe('logout / account deletion', () => {
    it('logout posts cookie-only (no Bearer, no body token) and clears the session', async () => {
      const { ctrl, service } = setup();
      const login = service.login('a@b.c', 'pw');
      ctrl.expectOne(`${auth}/login/`).flush({ access: 'acc', user });
      await login;
      const done = service.logout();
      const req = ctrl.expectOne(`${auth}/logout/`);
      expectCookieOptIn(req);
      expect(req.request.headers.has('Authorization')).toBe(false);
      expect(req.request.body).toEqual({});
      req.flush(null, { status: 204, statusText: 'No Content' });
      await done;
      expect(service.currentUser()).toBeNull();
      expect(service.accessToken).toBeNull();
      expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    });

    it('logout still clears locally when the server call fails, and never refreshes', async () => {
      localStorage.setItem(SESSION_HINT_KEY, '1');
      const { ctrl, service } = setup();
      const done = service.logout();
      ctrl.expectOne(`${auth}/logout/`).flush(null, { status: 500, statusText: 'Server Error' });
      await done;
      ctrl.expectNone(`${auth}/token/refresh/`);
      expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    });

    it('deleteAccount sends the Bearer + cookie opt-in and drops the session on 204', async () => {
      const { ctrl, service } = setup();
      const login = service.login('a@b.c', 'pw');
      ctrl.expectOne(`${auth}/login/`).flush({ access: 'a', user });
      await login;
      const done = service.deleteAccount('pw');
      const req = ctrl.expectOne(`${auth}/account/delete/`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ current_password: 'pw' });
      expect(req.request.headers.get('Authorization')).toBe('Bearer a');
      expectCookieOptIn(req);
      req.flush(null, { status: 204, statusText: 'No Content' });
      await done;
      expect(service.currentUser()).toBeNull();
      expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    });

    it('deleteAccount keeps the session on an error', async () => {
      const { ctrl, service } = setup();
      const login = service.login('a@b.c', 'pw');
      ctrl.expectOne(`${auth}/login/`).flush({ access: 'a', user });
      await login;
      const done = service.deleteAccount('bad');
      ctrl.expectOne(`${auth}/account/delete/`).flush({ code: 'current_password_invalid' }, { status: 400, statusText: 'Bad Request' });
      await expect(done).rejects.toMatchObject({ status: 400 });
      expect(service.currentUser()).toEqual(user);
    });
  });

  describe('multi-tab', () => {
    it('the hint being removed (logout in another tab) drops the in-memory session', async () => {
      const { ctrl, service } = setup();
      const login = service.login('a@b.c', 'pw');
      ctrl.expectOne(`${auth}/login/`).flush({ access: 'a', user });
      await login;
      localStorage.removeItem(SESSION_HINT_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_HINT_KEY, newValue: null }));
      expect(service.currentUser()).toBeNull();
      expect(service.accessToken).toBeNull();
    });

    it('a new hint value (login in another tab) restores from the shared cookie', async () => {
      const { ctrl, service } = setup();
      localStorage.setItem(SESSION_HINT_KEY, '2');
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_HINT_KEY, newValue: '2' }));
      await flush();
      ctrl.expectOne(`${auth}/token/refresh/`).flush({ access: 'b' });
      await flush();
      ctrl.expectOne(`${auth}/me/`).flush(user);
      await flush();
      expect(service.currentUser()).toEqual(user);
    });

    it('ignores storage events on other keys', () => {
      const { ctrl } = setup();
      window.dispatchEvent(new StorageEvent('storage', { key: 'poker.lang', newValue: 'en' }));
      ctrl.expectNone(`${auth}/token/refresh/`);
    });
  });

  it('exportData GETs the export and saves it under the server filename', async () => {
    const { ctrl, service } = setup();
    const login = service.login('a@b.c', 'pw');
    ctrl.expectOne(`${auth}/login/`).flush({ access: 'a', user });
    await login;
    const createUrl = vi.fn(() => 'blob:x');
    const revokeUrl = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('app-export-2026-10-18.json');
      expect(this.href).toBe('blob:x');
    });
    const done = service.exportData();
    const req = ctrl.expectOne(`${auth}/account/export/`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.headers.get('Authorization')).toBe('Bearer a');
    expect(req.request.withCredentials).toBe(false);
    req.flush(new Blob(['{}'], { type: 'application/json' }), {
      headers: { 'Content-Disposition': 'attachment; filename="app-export-2026-10-18.json"' },
    });
    await done;
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith('blob:x');
    click.mockRestore();
  });
});
