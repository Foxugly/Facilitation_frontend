import { HttpContextToken } from '@angular/common/http';

import { getRuntimeConfig } from '../runtime-config';

/** Prefix of every auth endpoint, derived from the API base — never hard-coded,
 * so it cannot drift from the URLs AuthService actually calls (the old regex
 * tested `/api/auth/` while the calls go to `/api/v1/auth/`, audit I7). */
export function authApiBase(): string {
  return `${getRuntimeConfig().apiBaseUrl}/api/v1/auth`;
}

/** Anonymous auth endpoints: no Bearer is attached and a 401 never triggers a
 * refresh. `token/refresh/` is the one that matters — refreshing on its own 401
 * looped until the throttle answered 429. `logout/` authenticates with the
 * HttpOnly refresh cookie alone (an expired access token must not 401 it). */
const PUBLIC_AUTH_PATHS = [
  'login/',
  'logout/',
  'register/',
  'token/refresh/',
  'magic-link/',
  'forgot-password/',
  'reset-password/',
  'email/',
];

export function isPublicAuthEndpoint(url: string): boolean {
  const base = `${authApiBase()}/`;
  if (!url.startsWith(base)) return false;
  const rest = url.slice(base.length);
  return PUBLIC_AUTH_PATHS.some((p) => rest.startsWith(p));
}

/** Set on a request that must not go through refresh-and-retry on a 401
 * (the refresh call itself, logout). */
export const NO_AUTH_RETRY = new HttpContextToken<boolean>(() => false);
