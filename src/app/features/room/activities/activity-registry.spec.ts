import { describe, expect, it } from 'vitest';

import { ACTIVITY_REGISTRY, resolveActivity } from './activity-registry';

describe('ACTIVITY_REGISTRY', () => {
  it(
    "delegation_poker consomme des 'items' -- vocabulaire aligne sur le registre serveur " +
      "(realtime/activities.py::ActivitySpec.consumes), plus 'subjects' (mot banni du domaine)",
    () => {
      expect(ACTIVITY_REGISTRY['delegation_poker'].consumes).toBe('items');
    },
  );

  it('resolveActivity replie sur delegation_poker pour un voteType inconnu ou absent', () => {
    expect(resolveActivity(undefined)).toBe(ACTIVITY_REGISTRY['delegation_poker']);
    expect(resolveActivity(null)).toBe(ACTIVITY_REGISTRY['delegation_poker']);
    expect(resolveActivity('inconnu')).toBe(ACTIVITY_REGISTRY['delegation_poker']);
  });
});
