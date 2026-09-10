import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { getRuntimeConfig } from '../runtime-config';
import { StaffUser } from './staff.models';

/** Back-office staff : recherche de comptes et bascule de l'accès offert.
 *  Le serveur applique IsAdminUser ; le guard côté client n'est qu'un masquage. */
@Injectable({ providedIn: 'root' })
export class StaffService {
  // Injection par constructeur (et non le champ `inject()` habituel) : le repo
  // n'a pas de TestBed, le spec instancie le service avec un mock via `new`.
  constructor(private readonly http: HttpClient) {}

  // Comme les autres services core/, appelé cross-origin via apiBaseUrl (le
  // front n'est pas servi par le même vhost que l'API, cf. nginx CSP connect-src).
  private base = getRuntimeConfig().apiBaseUrl + '/api/v1/staff/users';

  search(q: string): Observable<StaffUser[]> {
    return this.http
      .get<{ results: StaffUser[] }>(`${this.base}/`, { params: { q } })
      .pipe(map((r) => r.results));
  }

  setBypass(id: number, bypass: boolean, note: string): Observable<StaffUser> {
    return this.http.patch<StaffUser>(`${this.base}/${id}/`, {
      subscription_bypass: bypass,
      bypass_note: note,
    });
  }
}
