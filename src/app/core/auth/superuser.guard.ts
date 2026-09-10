import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Guards the staff back-office; sends non-superusers home. UI masking only —
 *  the server enforces IsAdminUser on every staff endpoint. */
export const superuserGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  if (!auth.currentUser()?.is_superuser) return router.createUrlTree(['/']);
  return true;
};
