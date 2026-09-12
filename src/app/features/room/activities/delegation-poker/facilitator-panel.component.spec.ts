import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AgendaItem, DeckSnapshot } from '../../../../core/realtime/protocol';
import { RoomSocketService } from '../../../../core/realtime/room-socket.service';
import { DelegationPokerFacilitatorPanelComponent } from './facilitator-panel.component';

// Meme motif que room-socket.service.spec.ts : intercepte les intentions
// emises sans passer par un vrai WebSocket (send() est privee, mais reste une
// propriete d'instance ordinaire une fois compilee).
function captureSent(svc: RoomSocketService): { type: string; payload: unknown }[] {
  const sent: { type: string; payload: unknown }[] = [];
  (svc as unknown as { send: (type: string, payload: unknown) => void }).send = (type, payload) => {
    sent.push({ type, payload });
  };
  return sent;
}

function deckSnapshot(deckId: number): DeckSnapshot {
  return {
    voteType: 'delegation_poker',
    resolutionStrategy: 'v1',
    deckId,
    cardBack: { style: 'color', image: null, color: '#111' },
    felt: { style: 'color', image: null, color: '#222' },
    cards: [],
  };
}

/**
 * TranslocoService reel non fourni : LanguageService (injectee par le panneau)
 * s'abonne a `events$` des sa construction, et translate() n'est appele que par
 * des computed jamais lus ici (deckOptions, timerSuffix). Meme reduction que
 * `language.service.spec.ts`.
 */
function setup() {
  TestBed.configureTestingModule({
    providers: [
      RoomSocketService,
      {
        provide: TranslocoService,
        useValue: { events$: new Subject(), setActiveLang: vi.fn(), translate: (k: string) => k },
      },
    ],
  });
  const socket = TestBed.inject(RoomSocketService);
  const sent = captureSent(socket);
  const component = TestBed.createComponent(DelegationPokerFacilitatorPanelComponent).componentInstance;
  return { component, socket, sent };
}

describe('DelegationPokerFacilitatorPanelComponent.prepare()', () => {
  it('round neuf : le deck part AVEC round.prepare, round.configure n est pas emise', () => {
    const { component, sent } = setup();
    // Aucun round courant : agenda vide, editing() jamais entre.
    component.subjectDraft.set('Un sujet neuf');
    component.onDeckChange(7);

    component.prepare();

    const prep = sent.find((s) => s.type === 'round.prepare');
    expect(prep).toBeDefined();
    expect(prep!.payload).toMatchObject({ subjectText: 'Un sujet neuf', deckId: 7 });
    expect(sent.some((s) => s.type === 'round.configure')).toBe(false);
  });

  it('round deja prepare, deck change : round.prepare part SANS deckId, round.configure le porte separement', () => {
    const { component, socket, sent } = setup();
    // Round deja annonce (idle), deck actif = 3.
    socket.roundState.set('idle');
    socket.subject.set('Deja prepare');
    socket.deckSnapshot.set(deckSnapshot(3));
    socket.agenda.set([
      { id: 5, text: 'Deja prepare', status: 'current', state: 'idle', result: null, items: [{ id: 10, text: 'Deja prepare', sequence: 1 }] },
    ] satisfies AgendaItem[]);

    component.enterCompose(); // deckDraft <- currentDeckId() = 3
    component.onDeckChange(9); // le facilitateur choisit un AUTRE deck

    component.prepare();

    const prep = sent.find((s) => s.type === 'round.prepare');
    expect(prep).toBeDefined();
    expect(prep!.payload).not.toHaveProperty('deckId');
    expect(prep!.payload).toMatchObject({ subjectText: 'Deja prepare' });

    const configure = sent.find((s) => s.type === 'round.configure');
    expect(configure).toEqual({ type: 'round.configure', payload: { roundId: 5, deckId: 9 } });
  });

  it('round deja prepare, deck INCHANGE : round.configure n est pas emise', () => {
    const { component, socket, sent } = setup();
    socket.roundState.set('idle');
    socket.subject.set('Deja prepare');
    socket.deckSnapshot.set(deckSnapshot(3));
    socket.agenda.set([
      { id: 5, text: 'Deja prepare', status: 'current', state: 'idle', result: null, items: [{ id: 10, text: 'Deja prepare', sequence: 1 }] },
    ] satisfies AgendaItem[]);

    component.enterCompose(); // deckDraft <- currentDeckId() = 3, jamais touche ensuite

    component.prepare();

    const prep = sent.find((s) => s.type === 'round.prepare');
    expect(prep).toBeDefined();
    expect(prep!.payload).not.toHaveProperty('deckId');
    // Le point le plus fragile : un round.configure superflu (deck redit a
    // l'identique) reappliquerait quand meme select_deck cote serveur.
    expect(sent.some((s) => s.type === 'round.configure')).toBe(false);
  });
});

// A (pending, idle -- jamais ouvert), B (current), C (done, acte) : couvre les
// trois statuts d'agenda d'un seul tenant pour les tests de reordonnancement /
// elagage (tache 2).
function threeRoundAgenda(): AgendaItem[] {
  return [
    { id: 1, text: 'A', status: 'pending', state: 'idle', result: null, items: [{ id: 11, text: 'A', sequence: 1 }] },
    { id: 2, text: 'B', status: 'current', state: 'idle', result: null, items: [{ id: 12, text: 'B', sequence: 2 }] },
    { id: 3, text: 'C', status: 'done', state: 'acted', result: '8', items: [{ id: 13, text: 'C', sequence: 3 }] },
  ];
}

// D (pending, mais ouvert puis abandonne SANS resultat) : `status` seul ne le
// distingue pas de A ci-dessus -- c'est exactement le round que la tache 4
// complement visait, (cf. `services.py::remove_round`, garde "round en vol").
function abandonedOpenRound(): AgendaItem {
  return { id: 4, text: 'D', status: 'pending', state: 'open', result: null, items: [{ id: 14, text: 'D', sequence: 4 }] };
}

describe('DelegationPokerFacilitatorPanelComponent.moveUp()/moveDown()', () => {
  it('moveUp(1) envoie round.reorder avec B et A echanges, C inchange', () => {
    const { component, socket, sent } = setup();
    socket.agenda.set(threeRoundAgenda());

    component.moveUp(1);

    // Mutation a guetter : envoyer l etat PRECEDENT (ids tels quels) plutot
    // que l ordre fraichement echange romprait ce test.
    expect(sent).toEqual([{ type: 'round.reorder', payload: { roundIds: [2, 1, 3] } }]);
  });

  it('moveDown(0) envoie le meme echange, vu depuis l autre extremite', () => {
    const { component, socket, sent } = setup();
    socket.agenda.set(threeRoundAgenda());

    component.moveDown(0);

    expect(sent).toEqual([{ type: 'round.reorder', payload: { roundIds: [2, 1, 3] } }]);
  });

  it("moveUp sur la PREMIERE entree n emet rien (rien a echanger au-dela du bord)", () => {
    const { component, socket, sent } = setup();
    socket.agenda.set(threeRoundAgenda());

    component.moveUp(0);

    expect(sent).toEqual([]);
  });

  it("moveDown sur la DERNIERE entree n emet rien", () => {
    const { component, socket, sent } = setup();
    socket.agenda.set(threeRoundAgenda());

    component.moveDown(2);

    expect(sent).toEqual([]);
  });
});

describe('DelegationPokerFacilitatorPanelComponent.removeRound()', () => {
  it('emet round.remove avec le roundId de l entree visee', () => {
    const { component, socket, sent } = setup();
    socket.agenda.set(threeRoundAgenda());

    component.removeRound(1);

    expect(sent).toEqual([{ type: 'round.remove', payload: { roundId: 1 } }]);
  });
});

describe('DelegationPokerFacilitatorPanelComponent — gestes non proposes (gardes §4)', () => {
  it('isRemovable : seule l entree pending est retirable, pas current ni done', () => {
    const { component, socket } = setup();
    const [a, b, c] = threeRoundAgenda();
    socket.agenda.set([a, b, c]);

    expect(component.isRemovable(a)).toBe(true);
    expect(component.isRemovable(b)).toBe(false);
    expect(component.isRemovable(c)).toBe(false);
  });

  // Le test qui manquait avant l'ajout de `state` cote serveur : un round
  // ouvert puis abandonne sans resultat est `status: 'pending'` (comme A,
  // jamais ouvert), mais son `state` reste 'open' -- le serveur le refuse
  // ("round en vol"), donc le bouton de retrait ne doit pas apparaitre.
  it("isRemovable : une entree pending mais ouverte en vol (state 'open') n est PAS retirable", () => {
    const { component, socket } = setup();
    const abandoned = abandonedOpenRound();
    socket.agenda.set([abandoned]);

    expect(abandoned.status).toBe('pending'); // meme statut que A, a dessein
    expect(component.isRemovable(abandoned)).toBe(false);
  });

  it('isFirst/isLast bornent monter/descendre aux deux extremites de la file', () => {
    const { component, socket } = setup();
    socket.agenda.set(threeRoundAgenda());

    expect(component.isFirst(0)).toBe(true);
    expect(component.isFirst(1)).toBe(false);
    expect(component.isLast(2)).toBe(true);
    expect(component.isLast(1)).toBe(false);
  });
});
