import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { getRuntimeConfig } from '../runtime-config';
import { HistoryDay, HistoryDetail } from './history.models';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private http = inject(HttpClient);
  private base = getRuntimeConfig().apiBaseUrl + '/api/v1/history';

  listDays(teamId: number) {
    return firstValueFrom(this.http.get<{ days: HistoryDay[] }>(`${this.base}/${teamId}/`));
  }
  getDay(teamId: number, date: string) {
    return firstValueFrom(this.http.get<HistoryDetail>(`${this.base}/${teamId}/${date}/`));
  }
  emailDay(teamId: number, date: string) {
    return firstValueFrom(this.http.post<{ sent: number }>(`${this.base}/${teamId}/${date}/email/`, {}));
  }
}
