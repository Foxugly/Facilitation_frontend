import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { getRuntimeConfig } from '../runtime-config';
import { AuthService } from './auth.service';

/**
 * Attaches the access token to API calls and, on a 401, refreshes once (persisting
 * the rotated refresh token) and retries. Skips the auth token endpoints to avoid loops.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const apiBase = getRuntimeConfig().apiBaseUrl;

  const isApi = req.url.startsWith(apiBase);
  const isTokenEndpoint = /\/api\/auth\/(login|register|token\/refresh|magic-link|forgot-password|reset-password|email)\b/.test(req.url);

  const withAuth = () => {
    const token = auth.accessToken;
    return token && isApi ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  };

  return next(withAuth()).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || !isApi || isTokenEndpoint) {
        return throwError(() => err);
      }
      return from(auth.refresh()).pipe(
        switchMap((newAccess) => {
          if (!newAccess) return throwError(() => err);
          return next(req.clone({ setHeaders: { Authorization: `Bearer ${newAccess}` } }));
        }),
      );
    }),
  );
};
