import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { getRuntimeConfig } from '../runtime-config';
import { AuthUser, TokenPair } from './auth.models';

const ACCESS_KEY = 'poker.access';
const REFRESH_KEY = 'poker.refresh';

/**
 * Email-only authentication (Phase 2). "Remember me" governs where the token
 * pair is persisted: localStorage (survives browser restarts) when checked,
 * sessionStorage (cleared with the tab) when not — a client-side choice. Startup
 * and token refresh read from whichever store currently holds them. The rotated
 * refresh token MUST be persisted on every refresh (the backend blacklists the
 * old one — fleet JWT-rotation rule). `currentUser` is a signal the UI reacts to.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private base = getRuntimeConfig().apiBaseUrl + '/api/v1/auth';

  readonly currentUser = signal<AuthUser | null>(null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

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
    store.setItem(ACCESS_KEY, access);
    store.setItem(REFRESH_KEY, refresh);
  }
  private clearTokens(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
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

  async logout(): Promise<void> {
    const refresh = this.refreshToken;
    if (refresh) {
      try {
        await firstValueFrom(this.http.post(`${this.base}/logout/`, { refresh }));
      } catch {
        /* blacklist best-effort */
      }
    }
    this.clearTokens();
    this.currentUser.set(null);
  }

  /** Refresh the access token, persisting the rotated refresh token. Returns the
   * new access token, or null if the refresh is invalid (session ended). */
  async refresh(): Promise<string | null> {
    const refresh = this.refreshToken;
    if (!refresh) return null;
    try {
      const res = await firstValueFrom(
        this.http.post<{ access: string; refresh: string }>(`${this.base}/token/refresh/`, { refresh }),
      );
      this.storeTokens(res.access, res.refresh); // persist the ROTATED refresh
      return res.access;
    } catch {
      this.clearTokens();
      this.currentUser.set(null);
      return null;
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
      this.currentUser.set(await this.me());
    } catch {
      // access likely expired → try one refresh, then re-fetch
      if (await this.refresh()) {
        try {
          this.currentUser.set(await this.me());
        } catch {
          this.clearTokens();
        }
      }
    }
  }
}
