import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { authApiBase, NO_AUTH_RETRY } from './auth-endpoints';
import { AuthUser, TokenPair } from './auth.models';

// Storage keys inherited from the Poker fork: renaming them would sign everyone out.
export const ACCESS_KEY = 'poker.access';
export const REFRESH_KEY = 'poker.refresh';
/** Web Locks name serialising token/refresh/ across every tab of the origin. */
export const REFRESH_LOCK_NAME = 'facilitation.refresh';

/** 401/403 from token/refresh/ = refresh token rejected (expired, blacklisted).
 * Anything else (network, 5xx during a deploy, 429) is transient: keep the session. */
function isRejectedRefresh(err: unknown): boolean {
  return err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403);
}

/**
 * Email-only authentication (Phase 2). "Remember me" governs where the token
 * pair is persisted: localStorage (survives browser restarts) when checked,
 * sessionStorage (cleared with the tab) when not — a client-side choice. Startup
 * and token refresh read from whichever store currently holds them. The rotated
 * refresh token MUST be persisted on every refresh (the backend blacklists the
 * old one — fleet JWT-rotation rule). `currentUser` is a signal the UI reacts to.
 *
 * Multi-tab: tokens are always read from storage (never cached), a `storage`
 * event resyncs `currentUser` (login / logout in another tab), and the refresh
 * runs under a Web Lock; once inside, if another tab already rotated the refresh
 * token we adopt its pair instead of presenting the now-blacklisted one.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private base = authApiBase();

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
    return localStorage.getItem(ACCESS_KEY) ?? sessionStorage.getItem(ACCESS_KEY);
  }
  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY);
  }

  /** The store the session currently lives in (session takes precedence when
   * present, i.e. an un-remembered login), else localStorage by default. */
  private activeStore(): Storage {
    return sessionStorage.getItem(REFRESH_KEY) !== null ? sessionStorage : localStorage;
  }

  private storeTokens(access: string, refresh: string, store: Storage = this.activeStore()): void {
    const other = store === localStorage ? sessionStorage : localStorage;
    other.removeItem(ACCESS_KEY);
    other.removeItem(REFRESH_KEY);
    // Overwrite in place (never remove-then-set): other tabs must not see a
    // transient "no refresh token" (= logged out). Access first, so a tab woken
    // by the refresh write reads the matching access token.
    store.setItem(ACCESS_KEY, access);
    store.setItem(REFRESH_KEY, refresh);
  }
  private clearTokens(): void {
    // Refresh first: it is the key other tabs treat as "logged out".
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(ACCESS_KEY);
  }
  /** Drop the local session (no server call). */
  clearSession(): void {
    this.clearTokens();
    this.currentUser.set(null);
  }
  private adopt(pair: TokenPair, store?: Storage): AuthUser {
    this.storeTokens(pair.access, pair.refresh, store ?? this.activeStore());
    this.currentUser.set(pair.user);
    return pair.user;
  }

  // --- flows ---
  register(email: string, password: string, displayName: string, turnstileToken?: string) {
    return firstValueFrom(
      this.http.post<{ code: string; detail: string; email: string }>(`${this.base}/register/`, {
        email, password, display_name: displayName, turnstile_token: turnstileToken ?? '',
      }),
    );
  }

  /** `remember` (default true) → refresh token in localStorage; false →
   * sessionStorage (cleared when the tab closes). */
  async login(email: string, password: string, remember = true): Promise<AuthUser> {
    const pair = await firstValueFrom(this.http.post<TokenPair>(`${this.base}/login/`, { email, password }));
    return this.adopt(pair, remember ? localStorage : sessionStorage);
  }

  async confirmEmail(uid: string, token: string): Promise<AuthUser> {
    return this.adopt(await firstValueFrom(this.http.post<TokenPair>(`${this.base}/email/confirm/`, { uid, token })));
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
    return this.adopt(await firstValueFrom(this.http.post<TokenPair>(`${this.base}/magic-link/verify/`, { token })));
  }

  /** Best-effort server logout (blacklists the refresh token), then always
   * drops the local session. With an expired access token the logout would 401,
   * so refresh first; the logout itself is never retried by the interceptor. */
  async logout(): Promise<void> {
    if (this.refreshToken && this.accessTokenExpired()) {
      try {
        await this.refresh();
      } catch {
        /* transient: still try the logout below */
      }
    }
    const refresh = this.refreshToken;
    if (refresh) {
      try {
        await firstValueFrom(
          this.http.post(`${this.base}/logout/`, { refresh }, { context: new HttpContext().set(NO_AUTH_RETRY, true) }),
        );
      } catch {
        /* blacklist best-effort */
      }
    }
    this.clearSession();
  }

  /** Delete the signed-in account (RGPD art. 17). The server checks the
   * password, deletes the account and revokes its refresh tokens: on success
   * there is nothing left to log out from, so the local session is dropped. */
  async deleteAccount(currentPassword: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/account/delete/`, { current_password: currentPassword }));
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
   * Refresh the access token, persisting the rotated refresh token. Resolves the
   * new access token, or null when the refresh token was rejected (401/403: the
   * session is cleared). Throws on a transient failure (network, 5xx): the tokens
   * are kept and the next call retries.
   */
  refresh(): Promise<string | null> {
    const used = this.refreshToken;
    if (!used) return Promise.resolve(null);
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.withRefreshLock(() => this.refreshOrAdopt(used)).finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async refreshOrAdopt(used: string): Promise<string | null> {
    // Re-read storage inside the lock: another tab may have rotated (or ended)
    // the session while we waited.
    const stored = this.refreshToken;
    if (!stored) {
      this.currentUser.set(null);
      return null;
    }
    const storedAccess = this.accessToken;
    if (stored !== used && storedAccess) {
      return storedAccess; // adopt the pair the other tab just stored
    }
    try {
      const res = await firstValueFrom(
        this.http.post<{ access: string; refresh: string }>(
          `${this.base}/token/refresh/`,
          { refresh: stored },
          { context: new HttpContext().set(NO_AUTH_RETRY, true) },
        ),
      );
      this.storeTokens(res.access, res.refresh); // persist the ROTATED refresh
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

  /** Another tab wrote the session keys (event.key null = storage.clear()). */
  private onStorage(event: StorageEvent): void {
    if (event.key !== null && event.key !== REFRESH_KEY && event.key !== ACCESS_KEY) return;
    if (!this.refreshToken) {
      this.currentUser.set(null); // logged out elsewhere
    } else if (!this.currentUser()) {
      // Logged in elsewhere; a failure here changes nothing.
      this.me().then((user) => this.currentUser.set(user), () => undefined);
    }
  }

  /** Whether the access token's `exp` is past (5 s skew). False when undecodable. */
  accessTokenExpired(): boolean {
    const payload = this.accessToken?.split('.')[1];
    if (!payload) return false;
    try {
      const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return typeof exp === 'number' && exp * 1000 <= Date.now() + 5000;
    } catch {
      return false;
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

  /** Restore the session at app startup (called from an app initializer). */
  async bootstrap(): Promise<void> {
    if (!this.refreshToken) return;
    try {
      // An expired access 401s; the interceptor refreshes once and retries.
      this.currentUser.set(await this.me());
    } catch (err) {
      // Rejected refresh: refresh() already cleared the session. A transient
      // failure (API down during a deploy) keeps the tokens for the next load.
      if (err instanceof HttpErrorResponse && err.status === 401) this.clearSession();
    }
  }
}
