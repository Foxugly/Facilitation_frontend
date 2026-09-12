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

  it("dot_voting se resout par son voteType (cle = VoteType.code cote serveur, 'dot_voting', pas 'dot_voting_v1' qui designe la resolutionStrategy)", () => {
    expect(resolveActivity('dot_voting')).toBe(ACTIVITY_REGISTRY['dot_voting']);
  });

  it(
    "dot_voting produit des 'results' et SAIT classer -- premiere activite dont canRank " +
      "s'allumera au chainage (rank_value cote registre serveur, contrat §8.5)",
    () => {
      expect(ACTIVITY_REGISTRY['dot_voting'].produces).toBe('results');
    },
  );

  it('dot_voting ne declare PAS deck : ce panneau ne propose pas de selecteur de deck (limite connue, task-6-report.md)', () => {
    expect(ACTIVITY_REGISTRY['dot_voting'].teamOptions).not.toContain('deck');
  });

  it('delegation_poker et dot_voting resolvent des composants DIFFERENTS (registre = un point de resolution par activite)', () => {
    expect(ACTIVITY_REGISTRY['dot_voting'].board).not.toBe(ACTIVITY_REGISTRY['delegation_poker'].board);
    expect(ACTIVITY_REGISTRY['dot_voting'].panel).not.toBe(ACTIVITY_REGISTRY['delegation_poker'].panel);
  });
});
