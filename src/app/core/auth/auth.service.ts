import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { cookieAuthOptions } from './auth-cookie';
import { authApiBase, NO_AUTH_RETRY } from './auth-endpoints';
import { AuthUser, TokenPair } from './auth.models';

/**
 * Non-secret "a session exists" hint in localStorage. It tells a fresh page
 * load whether to try the silent restore, and its `storage` events tell the
 * other tabs "session changed" (new value) or "logged out" (removed). It never
 * carries a token: the refresh token lives in the backend's HttpOnly cookie and
 * the access token in memory only.
 */
export const SESSION_HINT_KEY = 'facilitation.session';

/** Pre-cookie storage keys (local or session storage), inherited from the Poker fork.
 * Read once for the migration, then deleted. */
export const LEGACY_ACCESS_KEY = 'poker.access';
export const LEGACY_REFRESH_KEY = 'poker.refresh';

/** Web Locks name serialising token/refresh/ across every tab of the origin. */
export const REFRESH_LOCK_NAME = 'facilitation.refresh';

/** Upper bound on the boot-time restore, so a hung API never blocks the SPA. */
export const RESTORE_TIMEOUT_MS = 10_000;

/** 401/403 from token/refresh/ = refresh token rejected (expired, blacklisted, absent).
 * Anything else (network, 5xx during a deploy, 429) is transient: keep the session. */
function isRejectedRefresh(err: unknown): boolean {
  return err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('restore timed out')), ms);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

/**
 * Email-only authentication with the refresh token in an HttpOnly cookie (fleet
 * design piloted on PushIT). Auth calls (login, magic-link verify, email
 * confirm, refresh, logout, account delete) send `X-Auth-Mode: cookie` +
 * `withCredentials`; the backend sets / rotates / clears the cookie and leaves
 * `refresh` out of the body. The access token and the user live in memory only;
 * a reload restores them through `token/refresh/` (cookie) + `me/`.
 *
 * "Remember me" is forwarded as `remember_me`: unchecked gives a browser-session
 * cookie (the old sessionStorage behaviour).
 *
 * Multi-tab: the refresh runs under a Web Lock, so two tabs never present the
 * same cookie (rotation would reject the second one); `storage` events on the
 * hint carry "session changed" (re-restore from the shared cookie) or "logged
 * out" (removed), never a token.
 *
 * The room WebSocket does not use any of this: it authenticates with the
 * participant token in `session.join`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private base = authApiBase();

  /** Memory only: a reload re-obtains it from the refresh cookie. */
  private readonly access = signal<string | null>(null);
  readonly currentUser = signal<AuthUser | null>(null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  /** In-tab single flight: concurrent 401s share one refresh. */
  private refreshInFlight: Promise<string | null> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const onStorage = (event: StorageEvent) => this.onStorage(event);
      window.addEventListener('storage', onStorage);
      inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', onStorage));
    }
  }

  get accessToken(): string | null {
    return this.access();
  }

  /** Whether a refresh is worth attempting: a live in-memory session, the hint,
   * or a legacy refresh token still waiting for its migration. */
  hasSession(): boolean {
    return this.access() !== null || localStorage.getItem(SESSION_HINT_KEY) !== null || this.legacyRefresh() !== null;
  }

  /** Drop the local session (memory + hint + legacy keys); the other tabs follow. */
  clearSession(): void {
    this.access.set(null);
    this.currentUser.set(null);
    localStorage.removeItem(SESSION_HINT_KEY);
    this.dropLegacyStorage();
  }

  /** Adopt a login / magic-link / email-confirm response (refresh already in the cookie). */
  private startSession(res: { access: string; user: AuthUser }): AuthUser {
    this.access.set(res.access);
    this.currentUser.set(res.user);
    this.dropLegacyStorage();
    this.announceSessionChange();
    return res.user;
  }

  // --- flows ---
  register(email: string, password: string, displayName: string, turnstileToken?: string) {
    return firstValueFrom(
      this.http.post<{ code: string; detail: string; email: string }>(`${this.base}/register/`, {
        email, password, display_name: displayName, turnstile_token: turnstileToken ?? '',
      }),
    );
  }

  /** `remember` (default true) → persistent refresh cookie; false → browser-session cookie. */
  async login(email: string, password: string, remember = true): Promise<AuthUser> {
    const res = await firstValueFrom(
      this.http.post<TokenPair>(`${this.base}/login/`, { email, password, remember_me: remember }, cookieAuthOptions()),
    );
    return this.startSession(res);
  }

  async confirmEmail(uid: string, token: string): Promise<AuthUser> {
    return this.startSession(
      await firstValueFrom(this.http.post<TokenPair>(`${this.base}/email/confirm/`, { uid, token }, cookieAuthOptions())),
    );
  }

  resendConfirmation(email: string) {
    return firstValueFrom(this.http.post(`${this.base}/email/resend/`, { email }));
  }

  forgotPassword(email: string, turnstileToken?: string) {
    return firstValueFrom(this.http.post(`${this.base}/forgot-password/`, { email, turnstile_token: turnstileToken ?? '' }));
  }

  resetPassword(uid: string, token: string, password: string) {
    return firstValueFrom(this.http.post(`${this.base}/reset-password/`, { uid, token, password }));
  }

  requestMagicLink(email: string, turnstileToken?: string) {
    return firstValueFrom(this.http.post(`${this.base}/magic-link/`, { email, turnstile_token: turnstileToken ?? '' }));
  }

  async verifyMagicLink(token: string): Promise<AuthUser> {
    return this.startSession(
      await firstValueFrom(this.http.post<TokenPair>(`${this.base}/magic-link/verify/`, { token }, cookieAuthOptions())),
    );
  }

  /** Best-effort server logout (blacklists the cookie's refresh token and clears
   * the cookie), then always drops the local session. Cookie only, no Bearer:
   * an expired access token cannot turn it into a 401. */
  async logout(): Promise<void> {
    const legacy = this.legacyRefresh();
    try {
      await firstValueFrom(
        this.http.post(`${this.base}/logout/`, legacy ? { refresh: legacy } : {}, {
          ...cookieAuthOptions(),
          context: new HttpContext().set(NO_AUTH_RETRY, true),
        }),
      );
    } catch {
      /* blacklist best-effort */
    }
    this.clearSession();
  }

  /** Delete the signed-in account (RGPD art. 17). The server checks the
   * password, deletes the account, revokes its refresh tokens and clears the
   * cookie: on success the local session is dropped. */
  async deleteAccount(currentPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.base}/account/delete/`, { current_password: currentPassword }, cookieAuthOptions()),
    );
    this.clearSession();
  }

  /** Download a copy of the signed-in user's data (RGPD art. 15 / 20) as a
   * JSON file. The filename comes from the server's Content-Disposition. */
  async exportData(): Promise<void> {
    const resp = await firstValueFrom(
      this.http.get(`${this.base}/account/export/`, { observe: 'response', responseType: 'blob' }),
    );
    const disposition = resp.headers.get('Content-Disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'export.json';
    const url = URL.createObjectURL(resp.body ?? new Blob([], { type: 'application/json' }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Obtain a fresh access token from the refresh cookie (the backend rotates it).
   * Resolves the new access token, or null when the refresh was rejected
   * (401/403: the session is cleared). Throws on a transient failure (network,
   * 5xx): the session is kept and the next call retries.
   */
  refresh(): Promise<string | null> {
    if (!this.hasSession()) return Promise.resolve(null);
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.withRefreshLock(() => this.postRefresh()).finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async postRefresh(): Promise<string | null> {
    // Migration: a token left in storage by the pre-cookie SPA is presented once
    // in the body (cookie mode on, so the rotated token lands in the cookie),
    // then deleted. Read inside the lock: another tab may already have migrated it.
    // The browser sends whatever cookie is current when the request leaves, so
    // a tab that waited for the lock uses the token the other tab just rotated.
    const legacy = this.legacyRefresh();
    try {
      const res = await firstValueFrom(
        this.http.post<{ access: string }>(`${this.base}/token/refresh/`, legacy ? { refresh: legacy } : {}, {
          ...cookieAuthOptions(),
          context: new HttpContext().set(NO_AUTH_RETRY, true),
        }),
      );
      if (legacy) this.dropLegacyStorage();
      this.access.set(res.access);
      return res.access;
    } catch (err) {
      if (isRejectedRefresh(err)) {
        this.clearSession();
        return null;
      }
      throw err;
    }
  }

  /** Run `task` under the cross-tab refresh lock; plain call without Web Locks. */
  private withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks?.request) return task();
    return locks.request(REFRESH_LOCK_NAME, task) as Promise<T>;
  }

  /** Another tab changed the hint (event.key null = storage.clear()). */
  private onStorage(event: StorageEvent): void {
    if (event.key !== null && event.key !== SESSION_HINT_KEY) return;
    if (event.newValue === null) {
      // Logged out elsewhere (the cookie is gone too): drop our copy.
      this.access.set(null);
      this.currentUser.set(null);
      return;
    }
    // Signed in elsewhere: the shared cookie already holds the new session.
    void this.bootstrap();
  }

  /** New hint value → a `storage` event in every other tab. */
  private announceSessionChange(): void {
    localStorage.setItem(SESSION_HINT_KEY, String(Date.now()));
  }

  private legacyRefresh(): string | null {
    return localStorage.getItem(LEGACY_REFRESH_KEY) ?? sessionStorage.getItem(LEGACY_REFRESH_KEY);
  }

  private dropLegacyStorage(): void {
    for (const store of [localStorage, sessionStorage]) {
      store.removeItem(LEGACY_REFRESH_KEY);
      store.removeItem(LEGACY_ACCESS_KEY);
    }
  }

  /** PATCH the profile (display name) and refresh the currentUser signal. */
  async uploadAvatar(image: File): Promise<AuthUser> {
    const fd = new FormData();
    fd.append('image', image);
    const user = await firstValueFrom(this.http.post<AuthUser>(`${this.base}/me/avatar/`, fd));
    this.currentUser.set(user);
    return user;
  }

  async deleteAvatar(): Promise<AuthUser> {
    const user = await firstValueFrom(this.http.delete<AuthUser>(`${this.base}/me/avatar/`));
    this.currentUser.set(user);
    return user;
  }

  async updateProfile(displayName: string): Promise<AuthUser> {
    const user = await firstValueFrom(
      this.http.patch<AuthUser>(`${this.base}/me/`, { display_name: displayName }),
    );
    this.currentUser.set(user);
    return user;
  }

  private async me(): Promise<AuthUser> {
    return firstValueFrom(this.http.get<AuthUser>(`${this.base}/me/`));
  }

  /**
   * Silent restore at app startup (app initializer) and when another tab signs
   * in: refresh through the cookie, then load `me/`. Never throws, gives up
   * after RESTORE_TIMEOUT_MS. A rejected refresh (401/403) ends the session; a
   * network error / 5xx keeps the hint so the next load retries.
   */
  async bootstrap(): Promise<void> {
    if (!this.hasSession()) return;
    try {
      await withTimeout(
        (async () => {
          const access = await this.refresh();
          if (!access) return; // rejected: refresh() already cleared the session
          this.currentUser.set(await this.me());
          // Migrated from a legacy token: start announcing the session.
          if (localStorage.getItem(SESSION_HINT_KEY) === null) this.announceSessionChange();
        })(),
        RESTORE_TIMEOUT_MS,
      );
    } catch {
      // Transient: keep the hint (and a session this tab already shows); a
      // fresh load renders as signed out until a later retry.
      if (!this.currentUser()) this.access.set(null);
    }
  }
}
