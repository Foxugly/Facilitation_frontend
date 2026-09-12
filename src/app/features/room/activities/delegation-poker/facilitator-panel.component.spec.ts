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
      { id: 5, text: 'Deja prepare', status: 'current', state: 'idle', everDecided: false, canRank: false, result: null, items: [{ id: 10, text: 'Deja prepare', sequence: 1 }] },
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
      { id: 5, text: 'Deja prepare', status: 'current', state: 'idle', everDecided: false, canRank: false, result: null, items: [{ id: 10, text: 'Deja prepare', sequence: 1 }] },
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
    { id: 1, text: 'A', status: 'pending', state: 'idle', everDecided: false, canRank: false, result: null, items: [{ id: 11, text: 'A', sequence: 1 }] },
    { id: 2, text: 'B', status: 'current', state: 'idle', everDecided: false, canRank: false, result: null, items: [{ id: 12, text: 'B', sequence: 2 }] },
    { id: 3, text: 'C', status: 'done', state: 'acted', everDecided: true, canRank: false, result: '8', items: [{ id: 13, text: 'C', sequence: 3 }] },
  ];
}

// D (pending, mais ouvert puis abandonne SANS resultat) : `status` seul ne le
// distingue pas de A ci-dessus -- c'est exactement le round que la tache 4
// complement visait, (cf. `services.py::remove_round`, garde "round en vol").
function abandonedOpenRound(): AgendaItem {
  return { id: 4, text: 'D', status: 'pending', state: 'open', everDecided: false, canRank: false, result: null, items: [{ id: 14, text: 'D', sequence: 4 }] };
}

// E (pending, idle, mais DEJA DECIDE) : acte puis `vote.reset` -- la
// reinitialisation vide les reponses et remet le round a idle SANS reecrire
// l'historique (2e complement tache 4). `status` et `state` seuls le
// confondent avec A : seul `everDecided` porte la trace de la decision passee.
function actedThenResetRound(): AgendaItem {
  return { id: 5, text: 'E', status: 'pending', state: 'idle', everDecided: true, canRank: false, result: null, items: [{ id: 15, text: 'E', sequence: 5 }] };
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

  // Le test de la reserve signalee dans le premier complement : un round acte
  // puis reinitialise redevient status/state identiques a A (jamais joue),
  // seul `everDecided` porte la difference -- et c'est justement ce que le
  // serveur garde (`results.exists()`, independant de l'etat courant).
  it("isRemovable : une entree idle/pending mais DEJA DECIDE (everDecided) n est PAS retirable", () => {
    const { component, socket } = setup();
    const resetAfterActing = actedThenResetRound();
    socket.agenda.set([resetAfterActing]);

    expect(resetAfterActing.status).toBe('pending'); // meme statut/etat que A
    expect(resetAfterActing.state).toBe('idle');
    expect(component.isRemovable(resetAfterActing)).toBe(false);
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

describe('DelegationPokerFacilitatorPanelComponent — chainage (design 5e, contrat §8.5)', () => {
  it('chainSourceOptions exclut le round courant, garde les autres', () => {
    const { component, socket } = setup();
    socket.agenda.set(threeRoundAgenda()); // B (id 2) est current

    expect(component.chainSourceOptions().map((o) => o.value)).toEqual([1, 3]);
  });

  it('chainOffered est faux sans aucun autre round a proposer comme source', () => {
    const { component, socket } = setup();
    socket.agenda.set([
      { id: 2, text: 'B', status: 'current', state: 'idle', everDecided: false, canRank: false, result: null, items: [] },
    ]);
    expect(component.chainOffered()).toBe(false);
  });

  it('chainOffered devient vrai des qu au moins un autre round existe', () => {
    const { component, socket } = setup();
    socket.agenda.set(threeRoundAgenda());
    expect(component.chainOffered()).toBe(true);
  });

  it("take: results n'est PAS propose tant que la source choisie n'a jamais ete decidee — le geste ne doit pas etre offert (§4)", () => {
    const { component, socket } = setup();
    socket.agenda.set(threeRoundAgenda());
    component.onChainSourceChange(1); // A : pending, everDecided false

    expect(component.chainTakeOptions().map((o) => o.value)).toEqual(['items']);
  });

  it('take: results apparait des que la source choisie a deja ete decidee (everDecided)', () => {
    const { component, socket } = setup();
    socket.agenda.set(threeRoundAgenda());
    component.onChainSourceChange(3); // C : done, everDecided true

    expect(component.chainTakeOptions().map((o) => o.value)).toEqual(['items', 'results']);
  });

  it('onChainTakeChange(items) efface le brouillon top (top exige take: results)', () => {
    const { component } = setup();
    component.chainTopDraft.set(3);

    component.onChainTakeChange('items');

    expect(component.chainTopDraft()).toBeNull();
  });

  it('un changement de source qui invalide take: results retombe sur items dans la valeur EFFECTIVE — sans jamais offrir le geste devenu impossible', () => {
    const { component, socket } = setup();
    socket.agenda.set(threeRoundAgenda());
    component.onChainSourceChange(3); // C : deja decide
    component.onChainTakeChange('results');
    expect(component.effectiveChainTake()).toBe('results');

    component.onChainSourceChange(1); // A : jamais decide -- results n'est plus offert

    // Purement derive (aucun effet a attendre) : la valeur EFFECTIVE retombe
    // aussitot sur 'items', meme si le brouillon brut porte encore 'results'.
    expect(component.effectiveChainTake()).toBe('items');
  });

  it('bindChain emet round.bind PUIS round.select sur le round courant (le bind seul ne resoudrait rien, le round est deja courant)', () => {
    const { component, socket, sent } = setup();
    socket.agenda.set(threeRoundAgenda()); // B (id 2) est current
    component.onChainSourceChange(1);
    component.onChainModeChange('manual');

    component.bindChain();

    expect(sent).toEqual([
      { type: 'round.bind', payload: { roundId: 2, sourceRoundId: 1, rule: { take: 'items', mode: 'manual', top: null } } },
      { type: 'round.select', payload: { roundId: 2 } },
    ]);
  });

  it("bindChain porte top uniquement quand take: results ET que la source sait classer (rule TOUJOURS les trois cles)", () => {
    const { component, socket, sent } = setup();
    const [a, b, c] = threeRoundAgenda();
    socket.agenda.set([a, b, { ...c, canRank: true }]); // C : decide ET sait classer
    component.onChainSourceChange(3);
    component.onChainTakeChange('results');
    component.onChainTopChange(2);

    component.bindChain();

    const bind = sent.find((s) => s.type === 'round.bind');
    expect(bind!.payload).toEqual({ roundId: 2, sourceRoundId: 3, rule: { take: 'results', mode: 'auto', top: 2 } });
  });

  it("bindChain n'envoie PAS top si la source ne sait pas classer, meme demande — le serveur refuse toujours ce geste (canRank)", () => {
    const { component, socket, sent } = setup();
    socket.agenda.set(threeRoundAgenda()); // C : decide, mais canRank: false par defaut
    component.onChainSourceChange(3);
    component.onChainTakeChange('results');
    component.onChainTopChange(2);

    component.bindChain();

    const bind = sent.find((s) => s.type === 'round.bind');
    expect(bind!.payload).toEqual({ roundId: 2, sourceRoundId: 3, rule: { take: 'results', mode: 'auto', top: null } });
  });

  it("le champ top N (offersChainTop) n'est offert que si la source sait classer", () => {
    const { component, socket } = setup();
    const [a, b, c] = threeRoundAgenda();
    socket.agenda.set([a, b, c]); // C : decide, canRank: false
    component.onChainSourceChange(3);
    component.onChainTakeChange('results');
    expect(component.offersChainTop()).toBe(false);

    socket.agenda.set([a, b, { ...c, canRank: true }]);
    expect(component.offersChainTop()).toBe(true);
  });

  it('bindChain n emet rien sans source choisie', () => {
    const { component, socket, sent } = setup();
    socket.agenda.set([
      { id: 2, text: 'B', status: 'current', state: 'idle', everDecided: false, canRank: false, result: null, items: [] },
    ]);

    component.bindChain();

    expect(sent).toEqual([]);
  });

  it('resolveChain emet round.resolve avec les sourceItemIds coches (des items de la SOURCE, jamais du round courant)', () => {
    const { component, socket, sent } = setup();
    socket.agenda.set([
      { id: 2, text: 'B', status: 'current', state: 'idle', everDecided: false, canRank: false, result: null, items: [] },
    ]);
    component.toggleChainCandidate(101, true);
    component.toggleChainCandidate(102, true);
    component.toggleChainCandidate(102, false); // decoche

    component.resolveChain();

    expect(sent).toEqual([{ type: 'round.resolve', payload: { roundId: 2, sourceItemIds: [101] } }]);
  });

  it('resolveChain n emet rien sans round courant connu', () => {
    const { component, sent } = setup();
    component.toggleChainCandidate(101, true);

    component.resolveChain();

    expect(sent).toEqual([]);
  });

  it('isChainCandidateChecked reflete l etat coche/decoche', () => {
    const { component } = setup();
    expect(component.isChainCandidateChecked(5)).toBe(false);

    component.toggleChainCandidate(5, true);
    expect(component.isChainCandidateChecked(5)).toBe(true);

    component.toggleChainCandidate(5, false);
    expect(component.isChainCandidateChecked(5)).toBe(false);
  });

  it('bindChain remet a zero la selection cochee — une nouvelle liaison rend toute coche anterieure hors-sujet', () => {
    const { component, socket } = setup();
    socket.agenda.set(threeRoundAgenda());
    component.toggleChainCandidate(101, true);
    expect(component.isChainCandidateChecked(101)).toBe(true);

    component.onChainSourceChange(1);
    component.bindChain();

    expect(component.isChainCandidateChecked(101)).toBe(false);
  });

  it('resolveChain remet a zero la selection cochee apres validation', () => {
    const { component, socket } = setup();
    socket.agenda.set([
      { id: 2, text: 'B', status: 'current', state: 'idle', everDecided: false, canRank: false, result: null, items: [] },
    ]);
    component.toggleChainCandidate(101, true);

    component.resolveChain();

    expect(component.isChainCandidateChecked(101)).toBe(false);
  });
});
