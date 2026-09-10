import { describe, expect, it } from 'vitest';

import { RoomSocketService } from './room-socket.service';
import { StateSync } from './protocol';

// Exercises the server->client reducer (onMessage) directly, without a socket:
// the service has no constructor deps, so we can drive its signals from envelopes.
function feed(svc: RoomSocketService, type: string, payload: unknown) {
  (svc as unknown as { onMessage: (m: unknown) => void }).onMessage({ v: 1, type, payload });
}

const SYNC: StateSync = {
  room: { code: 'ABC234', title: 'Retro' },
  protocolVersion: 1,
  roundState: 'open',
  subject: 'Budget?',
  availableDecks: [],
  reveal: { anonymous: false, canAnonymise: false },
  deckSnapshot: { voteType: 'delegation_poker', resolutionStrategy: 'v1', deckId: 1, cardBack: { style: 'image', image: null, color: '#143d2f' }, felt: { style: 'color', image: null, color: '#10b981' }, cards: [] },
  participants: [{ participantId: 'p1', username: 'Sam', role: 'facilitator', hasVoted: false }],
  myVote: 'consult',
  result: null,
  facilitatorPresent: true,
  agenda: [{ id: 1, text: 'Budget?', status: 'current', result: null }],
  deadline: null,
  timer: { enabled: false, seconds: 10 },
};

describe('RoomSocketService reducer', () => {
  it('applies state.sync', () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', SYNC);
    expect(svc.roundState()).toBe('open');
    expect(svc.subject()).toBe('Budget?');
    expect(svc.myVote()).toBe('consult');
    expect(svc.participants().length).toBe(1);
    expect(svc.agenda().length).toBe(1);
    expect(svc.agenda()[0].status).toBe('current');
  });

  it('montre les cartes jouees quand le serveur ne dit rien du depouillement', () => {
    // Le champ est arrive apres coup : un serveur qui ne l'envoie pas encore ne doit
    // pas laisser la salle sans mise en page, ni basculer sur celle qu'elle n'a pas
    // choisie. Les cartes jouees sont le defaut, cote serveur comme ici.
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', SYNC);
    expect(svc.resultLayout()).toBe('cards');

    feed(svc, 'state.sync', { ...SYNC, resultLayout: 'summary' });
    expect(svc.resultLayout()).toBe('summary');
  });

  it('restores a revealed round from state.sync, cards included', () => {
    // Recharger la page pendant un round revele doit rendre le MEME ecran que pour
    // ceux qui etaient la : sans les votes nominatifs, les cartes du tapis restaient
    // face cachee alors que le decompte, lui, s'affichait.
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', {
      ...SYNC,
      roundState: 'revealed',
      tally: [{ cardValue: '4', count: 1 }],
      votes: [{ participantId: 'p1', cardValue: '4' }],
      spread: { min: 4, max: 4 },
    });
    expect(svc.roundState()).toBe('revealed');
    expect(svc.nominativeVotes()).toEqual([{ participantId: 'p1', cardValue: '4' }]);
    expect(svc.spread()).toEqual({ min: 4, max: 4 });
  });

  it('takes its own role from state.sync, not from the stored session', () => {
    // Le role passe a connect() vient de la session enregistree a l'arrivee : il est
    // perime des qu'on prend le role de facilitateur ou qu'on le cede.
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', { ...SYNC, myRole: 'facilitator', myParticipantId: 'p1' });
    expect(svc.myRole()).toBe('facilitator');
    expect(svc.myParticipantId()).toBe('p1');
  });

  it('promotes me live when I am the new facilitator', () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', { ...SYNC, myRole: 'voter', myParticipantId: 'p1' });
    feed(svc, 'facilitator.changed', { newFacilitatorId: 'p1' });
    expect(svc.myRole()).toBe('facilitator');
    expect(svc.facilitatorPresent()).toBe(true);
  });

  it('demotes me live when someone else takes the role', () => {
    // Le role change pour deux personnes : celle qui le prend et celle qui le perd.
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', { ...SYNC, myRole: 'facilitator', myParticipantId: 'p1' });
    feed(svc, 'facilitator.changed', { newFacilitatorId: 'p2' });
    expect(svc.myRole()).toBe('voter');
  });

  it('leaves the role alone when it does not know who it is yet', () => {
    // Avant le premier state.sync, se demettre sur une diffusion serait arbitraire.
    const svc = new RoomSocketService();
    svc.myRole.set('facilitator');
    feed(svc, 'facilitator.changed', { newFacilitatorId: 'p2' });
    expect(svc.myRole()).toBe('facilitator');
  });

  it('clears the spread when state.sync carries none', () => {
    // Un round anonyme, ou une echelle non ordinale comme le vote romain, n'en
    // envoie pas : l'ecart d'un round precedent ne doit pas survivre a l'ecran.
    const svc = new RoomSocketService();
    feed(svc, 'vote.revealed', { tally: [], spread: { min: 1, max: 7 } });
    feed(svc, 'state.sync', { ...SYNC, roundState: 'revealed', tally: [] });
    expect(svc.spread()).toEqual({ min: null, max: null });
  });

  it('applies the timer settings and deadline from state.sync', () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', { ...SYNC, deadline: '2026-07-18T12:00:30Z', timer: { enabled: true, seconds: 20 } });
    expect(svc.deadline()).toBe('2026-07-18T12:00:30Z');
    expect(svc.timer()).toEqual({ enabled: true, seconds: 20 });
  });

  it('carries the deadline on vote.opened', () => {
    const svc = new RoomSocketService();
    feed(svc, 'vote.opened', { deadline: '2026-07-18T12:00:30Z' });
    expect(svc.roundState()).toBe('open');
    expect(svc.deadline()).toBe('2026-07-18T12:00:30Z');
  });

  it('clears a stale deadline when vote.opened carries none', () => {
    const svc = new RoomSocketService();
    feed(svc, 'vote.opened', { deadline: '2026-07-18T12:00:30Z' });
    feed(svc, 'vote.opened', { deadline: null });
    expect(svc.deadline()).toBeNull();
  });

  it('updates the timer settings on timer.changed', () => {
    const svc = new RoomSocketService();
    feed(svc, 'timer.changed', { enabled: true, seconds: 25 });
    expect(svc.timer()).toEqual({ enabled: true, seconds: 25 });
  });

  it('clears the deadline on vote.revealed, whatever the reason', () => {
    const svc = new RoomSocketService();
    feed(svc, 'vote.opened', { deadline: '2026-07-18T12:00:30Z' });
    feed(svc, 'vote.revealed', { tally: [{ cardValue: '5', count: 2 }], spread: { min: 5, max: 5 }, reason: 'timeout' });
    expect(svc.roundState()).toBe('revealed');
    expect(svc.deadline()).toBeNull();
  });

  it('updates the scenario agenda on agenda.updated', () => {
    const svc = new RoomSocketService();
    feed(svc, 'agenda.updated', {
      agenda: [
        { id: 1, text: 'Q1', status: 'done', result: '5' },
        { id: 2, text: 'Q2', status: 'current', result: null },
      ],
    });
    expect(svc.agenda().length).toBe(2);
    expect(svc.agenda()[0].result).toBe('5');
    expect(svc.agenda()[1].status).toBe('current');
  });

  it('keeps vote values secret in participation.update', () => {
    const svc = new RoomSocketService();
    feed(svc, 'participation.update', { voted: 1, total: 2, votedIds: ['p1'] });
    expect(svc.participation().voted).toBe(1);
    expect(svc.participation().total).toBe(2);
  });

  it('reveals an anonymous tally (by value, no participant link) on vote.revealed', () => {
    const svc = new RoomSocketService();
    feed(svc, 'vote.revealed', {
      tally: [
        { cardValue: '5', count: 2 },
        { cardValue: '8', count: 1 },
      ],
      spread: { min: 5, max: 8 },
    });
    expect(svc.roundState()).toBe('revealed');
    expect(svc.voteTally()).toEqual([
      { cardValue: '5', count: 2 },
      { cardValue: '8', count: 1 },
    ]);
    expect(svc.spread()).toEqual({ min: 5, max: 8 });
    // Structural guarantee (not just "not displayed"): no entry in the exposed tally
    // carries any participant identifier — the value is never re-attached to a voter.
    for (const entry of svc.voteTally()) {
      expect(Object.keys(entry).sort()).toEqual(['cardValue', 'count']);
    }
  });

  it('carries the anonymous tally on state.sync for a latecomer joining a revealed round', () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', { ...SYNC, roundState: 'revealed', tally: [{ cardValue: '3', count: 1 }] });
    expect(svc.roundState()).toBe('revealed');
    expect(svc.voteTally()).toEqual([{ cardValue: '3', count: 1 }]);
  });

  it('resets vote state on vote.wasReset', () => {
    const svc = new RoomSocketService();
    feed(svc, 'vote.revealed', { tally: [{ cardValue: '5', count: 1 }], spread: { min: 5, max: 5 } });
    feed(svc, 'vote.wasReset', { nextState: 'idle' });
    expect(svc.roundState()).toBe('idle');
    expect(svc.voteTally().length).toBe(0);
    expect(svc.myVote()).toBeNull();
  });

  it('tracks facilitator presence', () => {
    const svc = new RoomSocketService();
    feed(svc, 'facilitator.presence', { present: false });
    expect(svc.facilitatorPresent()).toBe(false);
  });
});
