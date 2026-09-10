import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { getRuntimeConfig } from '../runtime-config';
import { Board, BoardRow } from './boards.models';

@Injectable({ providedIn: 'root' })
export class BoardsService {
  private http = inject(HttpClient);
  private base = getRuntimeConfig().apiBaseUrl + '/api/v1/board';

  getBoard(teamId: number) {
    return firstValueFrom(this.http.get<Board>(`${this.base}/${teamId}/`));
  }
  addRow(teamId: number, topic: string) {
    return firstValueFrom(this.http.post<BoardRow>(`${this.base}/${teamId}/rows/`, { topic }));
  }
  patchRow(teamId: number, rowId: number, patch: Partial<{ topic: string; asIs: string | null; toBe: string | null; order: number }>) {
    return firstValueFrom(this.http.patch<BoardRow>(`${this.base}/${teamId}/rows/${rowId}/`, patch));
  }
  deleteRow(teamId: number, rowId: number) {
    return firstValueFrom(this.http.delete(`${this.base}/${teamId}/rows/${rowId}/`));
  }
}
