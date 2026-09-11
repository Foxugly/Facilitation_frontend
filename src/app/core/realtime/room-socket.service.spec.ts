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
  myResponses: { '1': { card: 'consult' } },
  items: [{ id: 1, text: 'Budget?', sequence: 1 }],
  result: null,
  facilitatorPresent: true,
  agenda: [{ id: 1, text: 'Budget?', status: 'current', result: null, items: [{ id: 1, text: 'Budget?', sequence: 1 }] }],
  deadline: null,
  timer: { enabled: false, seconds: 10 },
};

describe('RoomSocketService reducer', () => {
  it('applies state.sync', () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', SYNC);
    expect(svc.roundState()).toBe('open');
    expect(svc.subject()).toBe('Budget?');
    expect(svc.currentItem()?.id).toBe(1);
    expect(svc.myResponses()['1']).toEqual({ card: 'consult' });
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

  it("state.sync ne restaure pas (encore) le depouillement d'un round revele", () => {
    // Ecart connu (contrat §8.2.b) : `itemResults` n'est fusionne dans state.sync par
    // AUCUN serveur aujourd'hui — seules les cles plates depreciees (tally/spread/votes)
    // le sont, et ce front ne les lit plus. Un arrivant (ou un rechargement) sur un round
    // deja revele voit donc un depouillement vide tant qu'un `vote.revealed` n'a pas ete
    // recu PENDANT cette connexion. Ce test documente le comportement actuel plutot que
    // de pretendre qu'il restaure quoi que ce soit — a corriger cote serveur.
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', {
      ...SYNC,
      roundState: 'revealed',
      tally: [{ cardValue: '4', count: 1 }],
      votes: [{ participantId: 'p1', cardValue: '4' }],
      spread: { min: 4, max: 4 },
    });
    expect(svc.roundState()).toBe('revealed');
    expect(svc.itemResults()).toEqual([]);
    expect(svc.currentItemResult()).toBeNull();
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

  it('clears the itemResults when a fresh state.sync carries none', () => {
    // Un round anonyme, ou une echelle non ordinale comme le vote romain, n'en
    // envoie pas : le depouillement d'un round precedent ne doit pas survivre a
    // l'ecran (state.sync remet toujours itemResults a vide, voir le test dedie
    // au dessus pour l'ecart que cela documente sur un round DEJA revele).
    const svc = new RoomSocketService();
    feed(svc, 'vote.revealed', { itemResults: [{ itemId: 1, tally: [], spread: { min: 1, max: 7 } }], anonymous: false });
    feed(svc, 'state.sync', SYNC);
    expect(svc.itemResults()).toEqual([]);
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
    feed(svc, 'vote.revealed', {
      itemResults: [{ itemId: 1, tally: [{ cardValue: '5', count: 2 }], spread: { min: 5, max: 5 } }],
      anonymous: false,
      reason: 'timeout',
    });
    expect(svc.roundState()).toBe('revealed');
    expect(svc.deadline()).toBeNull();
  });

  it('updates the scenario agenda on agenda.updated, and tracks the current item along with it', () => {
    const svc = new RoomSocketService();
    feed(svc, 'agenda.updated', {
      agenda: [
        { id: 1, text: 'Q1', status: 'done', result: '5', items: [{ id: 10, text: 'Q1', sequence: 1 }] },
        { id: 2, text: 'Q2', status: 'current', result: null, items: [{ id: 20, text: 'Q2', sequence: 1 }] },
      ],
    });
    expect(svc.agenda().length).toBe(2);
    expect(svc.agenda()[0].result).toBe('5');
    expect(svc.agenda()[1].status).toBe('current');
    // C'est la SEULE diffusion qui rediffuse l'item courant aux participants deja
    // connectes (contrat §8.2.b) : sans elle, `response.cast` n'aurait aucun
    // itemId a citer des qu'un nouveau round est compose.
    expect(svc.currentItem()).toEqual({ id: 20, text: 'Q2', sequence: 1 });
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
      itemResults: [
        {
          itemId: 1,
          tally: [
            { cardValue: '5', count: 2 },
            { cardValue: '8', count: 1 },
          ],
          spread: { min: 5, max: 8 },
        },
      ],
      anonymous: true,
    });
    expect(svc.roundState()).toBe('revealed');
    expect(svc.itemResults()).toEqual([
      {
        itemId: 1,
        tally: [
          { cardValue: '5', count: 2 },
          { cardValue: '8', count: 1 },
        ],
        spread: { min: 5, max: 8 },
      },
    ]);
    // Structural guarantee (not just "not displayed"): the item's block carries no
    // `votes` key at all — the value is never re-attached to a voter.
    for (const block of svc.itemResults()) {
      expect(Object.keys(block).sort()).toEqual(['itemId', 'spread', 'tally']);
    }
  });

  it("emet response.cast pour l'item courant, et voit son propre choix immediatement", () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', SYNC);
    svc.castVote('advise');
    // Optimiste : jamais secret pour soi-meme (contrat §6.a).
    expect(svc.myResponses()['1']).toEqual({ card: 'advise' });
  });

  it("castVote ne fait rien tant qu'aucun item courant n'est connu", () => {
    // Un participant deja connecte AVANT qu'un round n'existe n'a encore recu ni
    // state.sync ni agenda.updated portant un item : `response.cast` n'aurait
    // aucun itemId a citer, mieux vaut ne rien emettre que d'en inventer un.
    const svc = new RoomSocketService();
    svc.castVote('advise');
    expect(svc.myResponses()).toEqual({});
  });

  it('resets response state on vote.wasReset', () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', SYNC);
    feed(svc, 'vote.revealed', { itemResults: [{ itemId: 1, tally: [{ cardValue: '5', count: 1 }], spread: { min: 5, max: 5 } }], anonymous: false });
    feed(svc, 'vote.wasReset', { nextState: 'idle' });
    expect(svc.roundState()).toBe('idle');
    expect(svc.itemResults().length).toBe(0);
    expect(svc.myResponses()).toEqual({});
  });

  it('tracks facilitator presence', () => {
    const svc = new RoomSocketService();
    feed(svc, 'facilitator.presence', { present: false });
    expect(svc.facilitatorPresent()).toBe(false);
  });
});
