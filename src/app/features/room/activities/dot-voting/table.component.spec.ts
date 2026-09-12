import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { DeckSnapshot, RoundItem } from '../../../../core/realtime/protocol';
import { RoomSocketService } from '../../../../core/realtime/room-socket.service';
import { DotVotingTableComponent } from './table.component';

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
  { id: 3, text: 'Item C', sequence: 3 },
];

function setup() {
  // Reset explicite : un test compare parfois DEUX instances independantes
  // (deux "clients" dans la meme salle) en appelant setup() deux fois de
  // suite -- sans ce reset, la seconde reutiliserait le MEME singleton
  // RoomSocketService que la premiere (TestBed refuse aussi de reconfigurer
  // un module deja instancie).
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [RoomSocketService] });
  const socket = TestBed.inject(RoomSocketService);
  socket.deckSnapshot.set(deckSnapshot());
  socket.items.set(ITEMS);
  const component = TestBed.createComponent(DotVotingTableComponent).componentInstance;
  return { component, socket };
}

describe('DotVotingTableComponent -- budget (design dot-voting §1)', () => {
  it('itemCount/totalBudget se deduisent du nombre d items (n items -> 2n jetons)', () => {
    const { component } = setup();
    expect(component.itemCount()).toBe(3);
    expect(component.totalBudget()).toBe(6);
  });

  it('remainingBudget decompte mes propres reponses, tous items confondus', () => {
    const { component, socket } = setup();
    socket.myResponses.set({ '1': { points: 2 }, '2': { points: 1 } });
    expect(component.usedBudget()).toBe(3);
    expect(component.remainingBudget()).toBe(3); // 6 - 3
  });

  it('pointsFor renvoie 0 quand aucune reponse encore posee sur cet item', () => {
    const { component } = setup();
    expect(component.pointsFor(ITEMS[0])).toBe(0);
  });
});

describe('DotVotingTableComponent -- aucun geste impossible ne doit etre propose', () => {
  it('canIncrement est faux hors du vote (idle/revealed/acted)', () => {
    const { component, socket } = setup();
    socket.roundState.set('idle');
    expect(component.canIncrement(ITEMS[0])).toBe(false);
    socket.roundState.set('revealed');
    expect(component.canIncrement(ITEMS[0])).toBe(false);
  });

  it('canIncrement est faux au plafond PAR ITEM (n), meme s il reste du budget global', () => {
    const { component, socket } = setup();
    socket.roundState.set('open');
    // n = 3 : 3 jetons deja sur l'item 1 (son plafond), mais 3 restent au total (6-3).
    socket.myResponses.set({ '1': { points: 3 } });
    expect(component.remainingBudget()).toBe(3);
    expect(component.canIncrement(ITEMS[0])).toBe(false);
    // Un AUTRE item, lui, reste incrementable : le plafond est PAR item.
    expect(component.canIncrement(ITEMS[1])).toBe(true);
  });

  it('canIncrement est faux quand le BUDGET GLOBAL est epuise, meme sous le plafond par item', () => {
    const { component, socket } = setup();
    socket.roundState.set('open');
    // 6 jetons repartis, aucun item au plafond (n=3) individuellement.
    socket.myResponses.set({ '1': { points: 2 }, '2': { points: 2 }, '3': { points: 2 } });
    expect(component.remainingBudget()).toBe(0);
    expect(component.canIncrement(ITEMS[0])).toBe(false);
  });

  it('canDecrement est faux a zero, vrai des qu au moins un jeton est pose', () => {
    const { component, socket } = setup();
    socket.roundState.set('open');
    expect(component.canDecrement(ITEMS[0])).toBe(false);
    socket.myResponses.set({ '1': { points: 1 } });
    expect(component.canDecrement(ITEMS[0])).toBe(true);
  });

  it('increment/decrement sont des no-op silencieux quand le geste est refuse (jamais castResponse envoye)', () => {
    const { component, socket } = setup();
    socket.roundState.set('idle'); // pas votable
    const sent: unknown[] = [];
    (socket as unknown as { send: (t: string, p: unknown) => void }).send = (t, p) => sent.push({ t, p });
    component.increment(ITEMS[0]);
    component.decrement(ITEMS[0]);
    expect(sent).toEqual([]);
  });

  it('increment envoie castResponse avec points+1, decrement avec points-1', () => {
    const { component, socket } = setup();
    socket.roundState.set('open');
    const sent: { t: string; p: unknown }[] = [];
    (socket as unknown as { send: (t: string, p: unknown) => void }).send = (t, p) => sent.push({ t, p });

    component.increment(ITEMS[0]);
    expect(sent).toEqual([{ t: 'response.cast', p: { itemId: 1, payload: { points: 1 } } }]);

    sent.length = 0;
    socket.myResponses.set({ '1': { points: 1 } });
    component.decrement(ITEMS[0]);
    expect(sent).toEqual([{ t: 'response.cast', p: { itemId: 1, payload: { points: 0 } } }]);
  });
});

describe('DotVotingTableComponent -- totaux en direct, TROIS etats (round de correction 1, point 2)', () => {
  it("totalsDisplay est 'unknown' tant que roundConfig ne dit rien (jamais 'hidden' par defaut -- un ecran inconnu ne doit rien affirmer)", () => {
    const { component } = setup();
    expect(component.totalsDisplay(ITEMS[0])).toEqual({ kind: 'unknown' });
  });

  it("totalsDisplay est 'hidden' des que le round.configure recu dit liveTotals: false", () => {
    const { component, socket } = setup();
    socket.roundConfig.set({ liveTotals: false });
    expect(component.totalsDisplay(ITEMS[0])).toEqual({ kind: 'hidden' });
  });

  it("totalsDisplay est 'visible' avec le total de CET item quand liveTotals contient une entree", () => {
    const { component, socket } = setup();
    socket.roundConfig.set({ liveTotals: true });
    socket.liveTotals.set([{ itemId: 2, totalPoints: 5, responseCount: 2 }]);
    expect(component.totalsDisplay(ITEMS[1])).toEqual({ kind: 'visible', totalPoints: 5, responseCount: 2 });
  });

  it(
    "totalsDisplay est 'visible' a ZERO (pas 'unknown') quand la config l'autorise mais qu'aucun jeton " +
      "n'a encore ete pose -- la toute premiere reponse du round declenche deja une diffusion, donc " +
      "l'absence d'entree ne peut signifier que 'personne n'a encore rien pose', jamais 'je ne sais pas'",
    () => {
      const { component, socket } = setup();
      socket.roundConfig.set({ liveTotals: true });
      socket.liveTotals.set([]); // rien encore poste sur AUCUN item
      expect(component.totalsDisplay(ITEMS[0])).toEqual({ kind: 'visible', totalPoints: 0, responseCount: 0 });
    },
  );

  it(
    "deux clients dans la MEME salle, meme roundConfig, meme etat -- 'unknown' avant que la config ne " +
      "soit connue, 'visible' des qu'elle l'est : plus jamais deux ecrans contradictoires (l'un 'masque', " +
      "l'autre '0 pts') pour le meme etat reel",
    () => {
      const { component: freshJoiner, socket: s1 } = setup(); // roundConfig encore {}
      const { component: alreadyConnected, socket: s2 } = setup();
      s2.roundConfig.set({ liveTotals: true }); // a recu round.configured en direct

      expect(freshJoiner.totalsDisplay(ITEMS[0])).toEqual({ kind: 'unknown' });
      expect(alreadyConnected.totalsDisplay(ITEMS[0])).toEqual({ kind: 'visible', totalPoints: 0, responseCount: 0 });

      // Le meme reglage arrive enfin au premier (state.sync, ou round.configured) :
      // les deux ecrans convergent, aucun n'a jamais affirme le contraire entre-temps.
      s1.roundConfig.set({ liveTotals: true });
      expect(freshJoiner.totalsDisplay(ITEMS[0])).toEqual(alreadyConnected.totalsDisplay(ITEMS[0]));
    },
  );
});

describe('DotVotingTableComponent -- classement fige a la revelation (design §6, contrat §8.6)', () => {
  it('ranking trie par rang croissant (1 = le plus de jetons) et retrouve le texte de l item', () => {
    const { component, socket } = setup();
    socket.roundState.set('revealed');
    socket.itemResults.set([
      { itemId: 2, anonymous: false, totalPoints: 5, responseCount: 2, rank: 1 },
      { itemId: 1, anonymous: false, totalPoints: 3, responseCount: 1, rank: 2 },
    ]);
    expect(component.ranking().map((r) => r.itemId)).toEqual([2, 1]);
    expect(component.ranking()[0].text).toBe('Item B');
    expect(component.ranking()[0].totalPoints).toBe(5);
  });

  it('ranking ignore les blocs sans rang (round encore ouvert : itemResults est vide, pas de faux classement)', () => {
    const { component, socket } = setup();
    socket.roundState.set('open');
    socket.itemResults.set([]);
    expect(component.ranking()).toEqual([]);
  });

  it(
    "ranking ne construit AUCUNE liste de votants sur un round anonyme, MEME SI le bloc en porte une " +
      "par erreur -- defense en profondeur (round de correction 1, point 4) : le composant ne doit pas " +
      "dependre EXCLUSIVEMENT de la garantie serveur (aucun round anonyme n'ecrit jamais `votes`) pour " +
      "rester correct si elle venait a faillir un jour.",
    () => {
      const { component, socket } = setup();
      socket.roundState.set('revealed');
      socket.participants.set([{ participantId: 'p1', username: 'Sam', role: 'voter', hasVoted: true }]);
      socket.itemResults.set([
        {
          itemId: 1,
          anonymous: true,
          totalPoints: 2,
          responseCount: 1,
          rank: 1,
          // Bloc volontairement mal forme : `votes` present malgre `anonymous: true`.
          votes: [{ participantId: 'p1', points: 2 }],
        },
      ]);
      expect(component.ranking()[0].voters).toBe('');
    },
  );

  it('ranking ne construit aucune liste de votants sur un round anonyme SANS votes non plus (repli sur liste vide)', () => {
    const { component, socket } = setup();
    socket.roundState.set('revealed');
    socket.itemResults.set([{ itemId: 1, anonymous: true, totalPoints: 2, responseCount: 1, rank: 1 }]);
    expect(component.ranking()[0].voters).toBe('');
  });

  it('ranking formate les votants nominatifs "nom (points)"', () => {
    const { component, socket } = setup();
    socket.roundState.set('revealed');
    socket.participants.set([{ participantId: 'p1', username: 'Sam', role: 'voter', hasVoted: true }]);
    socket.itemResults.set([
      { itemId: 1, anonymous: false, totalPoints: 2, responseCount: 1, rank: 1, votes: [{ participantId: 'p1', points: 2 }] },
    ]);
    expect(component.ranking()[0].voters).toBe('Sam (2)');
  });
});
