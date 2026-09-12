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
      { id: 5, text: 'Deja prepare', status: 'current', result: null, items: [{ id: 10, text: 'Deja prepare', sequence: 1 }] },
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
      { id: 5, text: 'Deja prepare', status: 'current', result: null, items: [{ id: 10, text: 'Deja prepare', sequence: 1 }] },
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
