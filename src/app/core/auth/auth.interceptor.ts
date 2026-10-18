import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { getRuntimeConfig } from '../runtime-config';
import { isPublicAuthEndpoint, NO_AUTH_RETRY } from './auth-endpoints';
import { AuthService } from './auth.service';

/**
 * Attaches the access token to API calls and, on a 401, refreshes once (persisting
 * the rotated refresh token) and retries. The anonymous auth endpoints (login,
 * token/refresh, …) get no Bearer and are never retried, nor is a request flagged
 * NO_AUTH_RETRY — so a rejected refresh can never re-enter the refresh.
 *
 * AuthService.refresh() resolves null when the refresh token was rejected (the
 * session is then cleared) and throws on a network error / 5xx (tokens kept): in
 * both cases the caller gets an error, never a loop.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isApi = req.url.startsWith(getRuntimeConfig().apiBaseUrl);
  const isPublicAuth = isPublicAuthEndpoint(req.url);
  const canRetry = isApi && !isPublicAuth && !req.context.get(NO_AUTH_RETRY);

  const token = auth.accessToken;
  const sent = token && isApi && !isPublicAuth && !req.headers.has('Authorization')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(sent).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || !canRetry || !auth.refreshToken) {
        return throwError(() => err);
      }
      return from(auth.refresh()).pipe(
        switchMap((newAccess) => {
          if (!newAccess) return throwError(() => err);
          return next(
            req.clone({
              setHeaders: { Authorization: `Bearer ${newAccess}` },
              context: req.context.set(NO_AUTH_RETRY, true),
            }),
          );
        }),
      );
    }),
  );
};
