import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { getRuntimeConfig } from '../runtime-config';
import { DeckSnapshot, Role } from '../realtime/protocol';

export interface CreateRoomResponse {
  code: string;
  roomTitle: string;
  participantToken: string;
  role: Role;
  deckSnapshot: DeckSnapshot;
  isTeam: boolean;
}

export interface JoinRoomResponse extends CreateRoomResponse {}

export interface RoomExistsResponse {
  code: string;
  roomTitle: string;
  exists: boolean;
  isTeam: boolean;
}

/** HTTP boundary that creates/resolves a room before the socket opens (contract §1).
 * A `teamId` makes it a members-only, non-ephemeral team room (Phase 2). */
@Injectable({ providedIn: 'root' })
export class RoomApiService {
  private http = inject(HttpClient);
  private base = getRuntimeConfig().apiBaseUrl;

  /** Une salle sans compte ne transmet aucun choix : elle porte tout le catalogue
   * gratuit, le type de poker se change en salle et le dos est impose par le
   * serveur. Une salle d'equipe prend les decks actives par l'equipe. */
  createRoom(username: string, title: string, teamId?: number): Observable<CreateRoomResponse> {
    const body: Record<string, unknown> = { title };
    if (teamId != null) {
      body['team'] = teamId;
    } else {
      body['username'] = username;
    }
    return this.http.post<CreateRoomResponse>(`${this.base}/api/v1/rooms`, body);
  }

  joinRoom(code: string, username: string): Observable<JoinRoomResponse> {
    // Team rooms ignore username (the authed user + interceptor token identify them).
    return this.http.post<JoinRoomResponse>(`${this.base}/api/v1/rooms/${code}/join`, { username });
  }

  roomExists(code: string): Observable<RoomExistsResponse> {
    return this.http.get<RoomExistsResponse>(`${this.base}/api/v1/rooms/${code}`);
  }
}
