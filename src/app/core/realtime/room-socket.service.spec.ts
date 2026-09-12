import { describe, expect, it } from 'vitest';

import { RoomSocketService } from './room-socket.service';
import { StateSync } from './protocol';

// Exercises the server->client reducer (onMessage) directly, without a socket:
// the service has no constructor deps, so we can drive its signals from envelopes.
function feed(svc: RoomSocketService, type: string, payload: unknown) {
  (svc as unknown as { onMessage: (m: unknown) => void }).onMessage({ v: 1, type, payload });
}

// Capture les intentions emises sans passer par un vrai WebSocket : `send` est
// privee, mais reste une propriete d'instance ordinaire une fois compilee.
function captureSent(svc: RoomSocketService): { type: string; payload: unknown }[] {
  const sent: { type: string; payload: unknown }[] = [];
  (svc as unknown as { send: (type: string, payload: unknown) => void }).send = (type, payload) => {
    sent.push({ type, payload });
  };
  return sent;
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
  myResponses: { '1': { card: 'consult' } },
  items: [{ id: 1, text: 'Budget?', sequence: 1 }],
  result: null,
  facilitatorPresent: true,
  agenda: [{ id: 1, text: 'Budget?', status: 'current', state: 'open', everDecided: false, result: null, items: [{ id: 1, text: 'Budget?', sequence: 1 }] }],
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

  it("state.sync restaure le depouillement d'un round revele, et le laisse vide sur un round ouvert", () => {
    // Corrige cote serveur (build_state_sync fusionne desormais itemResults pour
    // REVEALED/ACTED, meme mecanique que les cles plates depreciees) : un arrivant
    // (ou un rechargement) sur un round deja revele voit maintenant le MEME
    // depouillement que ceux qui etaient la — sans les cartes du tapis restant
    // face cachee alors que le decompte, lui, s'afficherait.
    const svc = new RoomSocketService();
    const revealedBlock = {
      itemId: 1,
      tally: [{ cardValue: '4', count: 1 }],
      spread: { min: 4, max: 4 },
      votes: [{ participantId: 'p1', cardValue: '4' }],
    };
    feed(svc, 'state.sync', { ...SYNC, roundState: 'revealed', itemResults: [revealedBlock] });
    expect(svc.roundState()).toBe('revealed');
    expect(svc.itemResults()).toEqual([revealedBlock]);
    expect(svc.currentItemResult()?.spread).toEqual({ min: 4, max: 4 });

    // Repli : SYNC (roundState 'open') n'en porte pas — le depouillement d'un
    // round PRECEDENT ne doit pas survivre a l'ecran d'un round neuf.
    feed(svc, 'state.sync', SYNC);
    expect(svc.itemResults()).toEqual([]);
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
        { id: 1, text: 'Q1', status: 'done', state: 'acted', everDecided: true, result: '5', items: [{ id: 10, text: 'Q1', sequence: 1 }] },
        { id: 2, text: 'Q2', status: 'current', state: 'idle', everDecided: false, result: null, items: [{ id: 20, text: 'Q2', sequence: 1 }] },
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

  it("setItemText ajoute un item quand le round courant n'en porte encore aucun", () => {
    // Salle neuve, ou round remis a zero : aucun state.sync/agenda.updated n'a
    // encore livre d'item, currentItem() est donc null.
    const svc = new RoomSocketService();
    const sent = captureSent(svc);
    svc.setItemText('Budget ownership?');
    expect(sent).toEqual([{ type: 'item.add', payload: { text: 'Budget ownership?' } }]);
  });

  it("setItemText reecrit l'item courant quand le round en porte deja un", () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', SYNC); // items: [{ id: 1, ... }]
    const sent = captureSent(svc);
    svc.setItemText('Texte revise');
    expect(sent).toEqual([{ type: 'item.update', payload: { itemId: 1, text: 'Texte revise' } }]);
  });

  it('addRound empile un round de plus dans la file', () => {
    const svc = new RoomSocketService();
    const sent = captureSent(svc);
    svc.addRound('Un autre sujet');
    expect(sent).toEqual([{ type: 'round.add', payload: { text: 'Un autre sujet' } }]);
  });

  it("selectRound fait passer un round de la file en courant, meme id que l'agenda", () => {
    const svc = new RoomSocketService();
    const sent = captureSent(svc);
    svc.selectRound(42);
    expect(sent).toEqual([{ type: 'round.select', payload: { roundId: 42 } }]);
  });

  it('reorderRounds emet round.reorder avec la liste complete des ids, dans l ordre donne', () => {
    const svc = new RoomSocketService();
    const sent = captureSent(svc);
    svc.reorderRounds([3, 1, 2]);
    expect(sent).toEqual([{ type: 'round.reorder', payload: { roundIds: [3, 1, 2] } }]);
  });

  it('removeRound emet round.remove avec le bon id de round', () => {
    const svc = new RoomSocketService();
    const sent = captureSent(svc);
    svc.removeRound(7);
    expect(sent).toEqual([{ type: 'round.remove', payload: { roundId: 7 } }]);
  });

  it('tracks facilitator presence', () => {
    const svc = new RoomSocketService();
    feed(svc, 'facilitator.presence', { present: false });
    expect(svc.facilitatorPresent()).toBe(false);
  });
});

describe('RoomSocketService chaining (contrat §8.5, design §7)', () => {
  it('bindRound emet round.bind avec la regle complete (top TOUJOURS present, null si sans objet)', () => {
    const svc = new RoomSocketService();
    const sent = captureSent(svc);
    svc.bindRound(5, 2, { take: 'items', mode: 'manual', top: null });
    expect(sent).toEqual([
      { type: 'round.bind', payload: { roundId: 5, sourceRoundId: 2, rule: { take: 'items', mode: 'manual', top: null } } },
    ]);
  });

  it('resolveChaining omet sourceItemIds quand non fourni (mode auto : le serveur reprend tous les candidats)', () => {
    const svc = new RoomSocketService();
    const sent = captureSent(svc);
    svc.resolveChaining(5);
    expect(sent).toEqual([{ type: 'round.resolve', payload: { roundId: 5 } }]);
  });

  it('resolveChaining porte sourceItemIds quand fourni (mode manuel)', () => {
    const svc = new RoomSocketService();
    const sent = captureSent(svc);
    svc.resolveChaining(5, [10, 11]);
    expect(sent).toEqual([{ type: 'round.resolve', payload: { roundId: 5, sourceItemIds: [10, 11] } }]);
  });

  it('round.candidates alimente currentChainingCandidates quand il vise le round courant', () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', SYNC); // agenda[0].id = 1, status 'current'
    feed(svc, 'round.candidates', { roundId: 1, candidates: [{ sourceItemId: 9, text: 'Un', authorId: null }] });
    expect(svc.currentChainingCandidates()).toEqual([{ sourceItemId: 9, text: 'Un', authorId: null }]);
  });

  it("round.candidates pour un AUTRE round que le courant reste invisible (sourceItemId n'est pas un itemId du round affiche)", () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', SYNC); // round courant = 1
    feed(svc, 'round.candidates', { roundId: 99, candidates: [{ sourceItemId: 9, text: 'Un', authorId: null }] });
    expect(svc.currentChainingCandidates()).toBeNull();
  });

  it('round.bound invalide les candidats deja recus pour CE round (nouvelle regle : ancienne liste perimee)', () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', SYNC);
    feed(svc, 'round.candidates', { roundId: 1, candidates: [{ sourceItemId: 9, text: 'Un', authorId: null }] });
    feed(svc, 'round.bound', { roundId: 1, sourceRoundId: 2, rule: { take: 'items', mode: 'manual', top: null } });
    expect(svc.currentChainingCandidates()).toBeNull();
  });

  it('round.bound sur un AUTRE round ne touche pas les candidats du round courant', () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', SYNC);
    feed(svc, 'round.candidates', { roundId: 1, candidates: [{ sourceItemId: 9, text: 'Un', authorId: null }] });
    feed(svc, 'round.bound', { roundId: 42, sourceRoundId: 2, rule: { take: 'items', mode: 'manual', top: null } });
    expect(svc.currentChainingCandidates()).toEqual([{ sourceItemId: 9, text: 'Un', authorId: null }]);
  });

  it('round.resolved cloture la selection en cours pour CE round', () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', SYNC);
    feed(svc, 'round.candidates', { roundId: 1, candidates: [{ sourceItemId: 9, text: 'Un', authorId: null }] });
    feed(svc, 'round.resolved', { roundId: 1, items: [] });
    expect(svc.currentChainingCandidates()).toBeNull();
  });

  it('state.sync porte chainingCandidates pour le round courant (contrat §5.1, reservé au facilitateur)', () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', { ...SYNC, chainingCandidates: [{ sourceItemId: 3, text: 'Post-it', authorId: 7 }] });
    expect(svc.currentChainingCandidates()).toEqual([{ sourceItemId: 3, text: 'Post-it', authorId: 7 }]);
  });

  it('state.sync sans chainingCandidates efface une selection deja affichee', () => {
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', { ...SYNC, chainingCandidates: [{ sourceItemId: 3, text: 'Post-it', authorId: 7 }] });
    feed(svc, 'state.sync', SYNC);
    expect(svc.currentChainingCandidates()).toBeNull();
  });

  it("currentChainingCandidates ignore des candidats perimes des qu'un AUTRE round devient courant, meme sans round.bound/round.resolved explicite", () => {
    // L'ordre d'arrivee est contre-intuitif (round.candidates precede round.selected
    // sur la connexion du facilitateur, contrat §8.5.a) : cette garde ne doit rien
    // supposer sur l'ordre, seulement comparer deux valeurs deja posees.
    const svc = new RoomSocketService();
    feed(svc, 'state.sync', SYNC); // round courant = 1
    feed(svc, 'round.candidates', { roundId: 1, candidates: [{ sourceItemId: 9, text: 'Un', authorId: null }] });
    feed(svc, 'agenda.updated', {
      agenda: [
        { id: 1, text: 'Budget?', status: 'done', state: 'acted', everDecided: true, result: '5', items: [] },
        { id: 2, text: 'Suivant', status: 'current', state: 'idle', everDecided: false, result: null, items: [{ id: 20, text: 'Suivant', sequence: 1 }] },
      ],
    });
    expect(svc.currentChainingCandidates()).toBeNull();
  });
});
