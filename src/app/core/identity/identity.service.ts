import { Injectable } from '@angular/core';

import { Role } from '../realtime/protocol';

const NAME_KEY = 'facilitation.username';
const SESSION_KEY = 'facilitation.session';

export interface RoomSession {
  code: string;
  token: string;
  role: Role;
}

/**
 * Ephemeral anonymous identity (scope §3): the display name + per-room participant
 * token live in localStorage so a reconnect restores the room and vote (contract §3).
 * This is NOT an auth identity (email-only auth is Phase 2, §3.16).
 */
@Injectable({ providedIn: 'root' })
export class IdentityService {
  get username(): string {
    return localStorage.getItem(NAME_KEY) ?? '';
  }
  set username(value: string) {
    localStorage.setItem(NAME_KEY, value);
  }

  saveSession(session: RoomSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  sessionFor(code: string): RoomSession | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as RoomSession;
      return s.code?.toUpperCase() === code.toUpperCase() ? s : null;
    } catch {
      return null;
    }
  }
}
