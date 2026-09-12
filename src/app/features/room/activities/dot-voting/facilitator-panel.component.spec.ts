import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AgendaItem, DeckSnapshot, RoundItem } from '../../../../core/realtime/protocol';
import { RoomSocketService } from '../../../../core/realtime/room-socket.service';
import { DotVotingFacilitatorPanelComponent } from './facilitator-panel.component';

function deckSnapshot(): DeckSnapshot {
  return {
    voteType: 'dot_voting',
    resolutionStrategy: 'dot_voting_v1',
    deckId: 1,
    cardBack: { style: 'color', image: null, color: '#111' },
    felt: { style: 'color', image: null, color: '#222' },
    cards: [],
  };
}

const ITEMS: RoundItem[] = [
  { id: 1, text: 'Item A', sequence: 1 },
  { id: 2, text: 'Item B', sequence: 2 },
];

function agendaWithCurrent(roundId: number, items: RoundItem[]): AgendaItem[] {
  return [
    { id: roundId, text: items[0]?.text ?? '', status: 'current', state: 'idle', everDecided: false, canRank: false, result: null, items },
  ];
}

function captureSent(svc: RoomSocketService): { type: string; payload: unknown }[] {
  const sent: { type: string; payload: unknown }[] = [];
  (svc as unknown as { send: (type: string, payload: unknown) => void }).send = (type, payload) => {
    sent.push({ type, payload });
  };
  return sent;
}

function setup() {
  TestBed.configureTestingModule({ providers: [RoomSocketService] });
  const socket = TestBed.inject(RoomSocketService);
  socket.deckSnapshot.set(deckSnapshot());
  const sent = captureSent(socket);
  const component = TestBed.createComponent(DotVotingFacilitatorPanelComponent).componentInstance;
  return { component, socket, sent };
}

describe('DotVotingFacilitatorPanelComponent -- composition (etapes)', () => {
  it('showCompose tant qu aucun item n existe encore, showReady des le premier', () => {
    const { component, socket } = setup();
    socket.roundState.set('idle');
    socket.items.set([]);
    expect(component.showCompose()).toBe(true);
    expect(component.showReady()).toBe(false);

    socket.items.set([ITEMS[0]]);
    expect(component.showCompose()).toBe(false);
    expect(component.showReady()).toBe(true);
  });

  it("ni compose ni ready une fois le round ouvert/revele/acte", () => {
    const { component, socket } = setup();
    socket.items.set(ITEMS);
    for (const s of ['open', 'revealed', 'acted'] as const) {
      socket.roundState.set(s);
      expect(component.showCompose()).toBe(false);
      expect(component.showReady()).toBe(false);
    }
  });

  it('prepare() cree le round avec son premier item, sans deckId (ce panneau ne switche pas de deck)', () => {
    const { component, sent } = setup();
    component.firstItemDraft.set('Premier item');
    component.prepare();
    const prep = sent.find((s) => s.type === 'round.prepare');
    expect(prep).toBeDefined();
    expect(prep!.payload).not.toHaveProperty('deckId');
    expect(prep!.payload).toMatchObject({ subjectText: 'Premier item' });
  });

  it('prepare() ne fait rien sur un texte vide (garde cote client, meme motif que le poker)', () => {
    const { component, sent } = setup();
    component.firstItemDraft.set('   ');
    component.prepare();
    expect(sent).toEqual([]);
  });

  it("offersAnonymous/offersTimer lisent le registre (dot_voting les declare tous les deux)", () => {
    const { component } = setup();
    expect(component.offersAnonymous()).toBe(true);
    expect(component.offersTimer()).toBe(true);
  });
});

describe('DotVotingFacilitatorPanelComponent -- items du round (etape 2)', () => {
  it('addItem envoie item.add et vide le brouillon', () => {
    const { component, sent } = setup();
    component.newItemDraft.set('Un item de plus');
    component.addItem();
    expect(sent).toEqual([{ type: 'item.add', payload: { text: 'Un item de plus' } }]);
    expect(component.newItemDraft()).toBe('');
  });

  it("canRemoveItem est FAUX quand un seul item reste (n=0 casserait le budget 2n)", () => {
    const { component, socket } = setup();
    socket.items.set([ITEMS[0]]);
    expect(component.canRemoveItem()).toBe(false);
    socket.items.set(ITEMS);
    expect(component.canRemoveItem()).toBe(true);
  });

  it('removeItem ne fait rien tant que canRemoveItem est faux (dernier item protege)', () => {
    const { component, socket, sent } = setup();
    socket.items.set([ITEMS[0]]);
    component.removeItem(ITEMS[0].id);
    expect(sent).toEqual([]);
  });

  it('removeItem envoie item.remove quand au moins deux items existent', () => {
    const { component, socket, sent } = setup();
    socket.items.set(ITEMS);
    component.removeItem(ITEMS[0].id);
    expect(sent).toEqual([{ type: 'item.remove', payload: { itemId: 1 } }]);
  });

  it('moveDown/moveUp envoient reorderItems avec la liste COMPLETE, ordre echange', () => {
    const { component, socket, sent } = setup();
    socket.items.set(ITEMS); // ids [1, 2]
    component.moveDown(0);
    expect(sent).toEqual([{ type: 'item.reorder', payload: { itemIds: [2, 1] } }]);
  });

  it('moveUp sur le premier index (isFirst) et moveDown sur le dernier (isLast) ne font rien', () => {
    const { component, socket, sent } = setup();
    socket.items.set(ITEMS);
    expect(component.isFirst(0)).toBe(true);
    expect(component.isLast(1)).toBe(true);
    component.moveUp(0);
    component.moveDown(1);
    expect(sent).toEqual([]);
  });
});

describe(
  'DotVotingFacilitatorPanelComponent -- visibilite des totaux, TROIS etats ' +
    '(design §5, contrat §8.3, round de correction 1 point 3)',
  () => {
    it("liveTotalsState est 'unknown' par defaut (aucune config posee ni recue) -- PAS 'off'", () => {
      const { component } = setup();
      // Avant ce correctif, un reglage inconnu s'affichait comme "off" : une
      // FAUSSE ASSURANCE de confidentialite (le facilitateur pouvait ouvrir
      // le vote en croyant les totaux secrets alors que le serveur les
      // gardait "on" depuis un reglage anterieur a un rechargement).
      expect(component.liveTotalsState()).toBe('unknown');
    });

    it("liveTotalsState est 'off' des que le serveur confirme liveTotals: false (distinct de 'unknown')", () => {
      const { component, socket } = setup();
      socket.roundConfig.set({ liveTotals: false });
      expect(component.liveTotalsState()).toBe('off');
    });

    it('toggleLiveTotals envoie round.configure sur le round COURANT quand il existe', () => {
      const { component, socket, sent } = setup();
      socket.agenda.set(agendaWithCurrent(7, ITEMS));
      component.toggleLiveTotals(true);
      expect(sent).toEqual([{ type: 'round.configure', payload: { roundId: 7, config: { liveTotals: true } } }]);
    });

    it("toggleLiveTotals ne fait rien tant qu aucun round n est courant (garde defensive)", () => {
      const { component, sent } = setup();
      component.toggleLiveTotals(true);
      expect(sent).toEqual([]);
    });

    it("liveTotalsState reflete round.configured une fois recu (round.configured, contrat §8.3)", () => {
      const { component, socket } = setup();
      (socket as unknown as { onMessage: (m: unknown) => void }).onMessage({
        v: 1,
        type: 'round.configured',
        payload: { roundId: 7, deckSnapshot: deckSnapshot(), config: { liveTotals: true } },
      });
      expect(component.liveTotalsState()).toBe('on');
    });

    it(
      "liveTotalsState redevient 'unknown' apres un rechargement (state.sync SANS config) meme si le " +
        "serveur, lui, garde le reglage precedent -- l'affichage ne doit plus jamais mentir en 'off'",
      () => {
        const { component, socket } = setup();
        (socket as unknown as { onMessage: (m: unknown) => void }).onMessage({
          v: 1,
          type: 'round.configured',
          payload: { roundId: 7, deckSnapshot: deckSnapshot(), config: { liveTotals: true } },
        });
        expect(component.liveTotalsState()).toBe('on');

        socket.agenda.set(agendaWithCurrent(7, ITEMS));
        (socket as unknown as { onMessage: (m: unknown) => void }).onMessage({
          v: 1,
          type: 'state.sync',
          payload: {
            room: { code: 'ABC234', title: 'Retro' },
            protocolVersion: 1,
            roundState: 'idle',
            subject: 'Item A',
            availableDecks: [],
            reveal: { anonymous: false, canAnonymise: false },
            deckSnapshot: deckSnapshot(),
            participants: [],
            myResponses: {},
            items: ITEMS,
            result: null,
            facilitatorPresent: true,
            agenda: agendaWithCurrent(7, ITEMS),
            deadline: null,
            timer: { enabled: false, seconds: 10 },
            // Pas de `config` : c'est exactement le cas que ce correctif couvre.
          },
        });
        expect(component.liveTotalsState()).toBe('unknown');
      },
    );

    it(
      "liveTotalsState redevient 'on' quand le serveur confirme le reglage dans state.sync (round de " +
        "correction 1, point 3 -- 'construis dessus' : cle suppose 'config', a verifier au contrat)",
      () => {
        const { component, socket } = setup();
        socket.agenda.set(agendaWithCurrent(7, ITEMS));
        (socket as unknown as { onMessage: (m: unknown) => void }).onMessage({
          v: 1,
          type: 'state.sync',
          payload: {
            room: { code: 'ABC234', title: 'Retro' },
            protocolVersion: 1,
            roundState: 'idle',
            subject: 'Item A',
            availableDecks: [],
            reveal: { anonymous: false, canAnonymise: false },
            deckSnapshot: deckSnapshot(),
            participants: [],
            myResponses: {},
            items: ITEMS,
            result: null,
            facilitatorPresent: true,
            agenda: agendaWithCurrent(7, ITEMS),
            deadline: null,
            timer: { enabled: false, seconds: 10 },
            config: { liveTotals: true },
          },
        });
        expect(component.liveTotalsState()).toBe('on');
      },
    );
  },
);

describe('DotVotingFacilitatorPanelComponent -- reste a placer, reveal, conclusion', () => {
  it('pendingRows est vide tant qu aucune donnee n est arrivee (pas encore de response.cast)', () => {
    const { component } = setup();
    expect(component.pendingRows()).toEqual([]);
  });

  it('pendingRows associe chaque participant a son reste a placer', () => {
    const { component, socket } = setup();
    socket.participants.set([
      { participantId: 'p1', username: 'Sam', role: 'voter', hasVoted: true },
      { participantId: 'p2', username: 'Lee', role: 'voter', hasVoted: false },
    ]);
    socket.pendingBudgets.set({ p1: 1, p2: 4 });
    expect(component.pendingRows()).toEqual([
      { participantId: 'p1', name: 'Sam', remaining: 1 },
      { participantId: 'p2', name: 'Lee', remaining: 4 },
    ]);
  });

  it('canReveal exige le round ouvert ET au moins une reponse (meme regle que le poker)', () => {
    const { component, socket } = setup();
    socket.roundState.set('open');
    socket.participation.set({ voted: 0, total: 2, votedIds: [] });
    expect(component.canReveal()).toBe(false);
    socket.participation.set({ voted: 1, total: 2, votedIds: ['p1'] });
    expect(component.canReveal()).toBe(true);
  });

  it('conclude() envoie result.act SANS chosenValue (contrat §8.6 : Dot Voting fige au reveal)', () => {
    const { component, sent } = setup();
    component.conclude();
    expect(sent).toEqual([{ type: 'result.act', payload: {} }]);
  });
});
