import { describe, expect, it } from 'vitest';

import { bypassPatch } from './bypass-patch';

// Corps de requête envoyé par le back-office lors de la bascule de l'accès
// offert : le motif transmis doit être celui saisi dans l'écran, jamais une
// valeur recalculée côté fonction (cf. staff-users.component.ts:toggle).
describe('bypassPatch', () => {
  it('transmet le motif saisi plutot que la note existante', () => {
    expect(bypassPatch(true, 'asso X')).toEqual({ subscription_bypass: true, bypass_note: 'asso X' });
  });

  it('transmet une note vide telle quelle', () => {
    expect(bypassPatch(false, '')).toEqual({ subscription_bypass: false, bypass_note: '' });
  });
});
