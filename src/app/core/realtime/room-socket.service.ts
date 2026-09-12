import { Injectable, computed, signal } from '@angular/core';

import { getRuntimeConfig } from '../runtime-config';
import {
  AgendaItem,
  AvailableDeck,
  DeckSnapshot,
  Envelope,
  ItemResult,
  MyResponses,
  Participation,
  ParticipantView,
  PROTOCOL_VERSION,
  RevealedPayload,
  Role,
  RoomError,
  ResultLayout,
  RoundConfigurePayload,
  RoundItem,
  RoundState,
  StateSync,
  TimerSettings,
  RevealMode,
} from './protocol';

/**
 * Encapsulates the WebSocket connection to a room (contract §2-§8) and exposes the
 * server-authoritative state as signals. Clients emit intentions; the UI reacts to
 * the server's rebroadcast facts — no optimistic state except the caster's own vote
 * (which is never secret from itself).
 */
@Injectable({ providedIn: 'root' })
export class RoomSocketService {
  private ws: WebSocket | null = null;
  private code = '';
  private token = '';
  private manualClose = false;
  private reconnectAttempts = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  readonly connected = signal(false);
  readonly roomTitle = signal('');
  /** Team room or anonymous — drives client-side feature gating (timer is team-only). */
  readonly isTeam = signal(false);
  readonly roundState = signal<RoundState>('idle');
  readonly subject = signal('');
  readonly deckSnapshot = signal<DeckSnapshot | null>(null);
  readonly availableDecks = signal<AvailableDeck[]>([]);
  readonly participants = signal<ParticipantView[]>([]);
  readonly participation = signal<Participation>({ voted: 0, total: 0, votedIds: [] });
  /** Les items du round courant (design N-items, §5). Tenu a jour par
   * `state.sync` (a la connexion) ET par `agenda.updated` (a chaque round
   * compose/repris) : ce dernier est le SEUL evenement qui rediffuse l'item
   * neuf aux participants deja connectes, les alias herites (`round.prepare`,
   * `round.add`...) ne portant que le texte du sujet. */
  readonly items = signal<RoundItem[]>([]);
  /** Un round ne porte qu'un item aujourd'hui : "l'item courant" est le premier. */
  readonly currentItem = computed<RoundItem | null>(() => this.items()[0] ?? null);
  /** Mes reponses au round courant, indexees par id d'item (string, cote JSON).
   * Remplace l'ancien `myVote`, qui ne portait qu'une valeur pour tout le round :
   * un composant lit desormais `myResponses()[currentItem()?.id]?.card`. */
  readonly myResponses = signal<MyResponses>({});
  /** Le depouillement, un bloc par item, une fois le round revele. */
  readonly itemResults = signal<ItemResult[]>([]);
  /** Le bloc de depouillement de l'item courant. */
  readonly currentItemResult = computed<ItemResult | null>(() => {
    const item = this.currentItem();
    if (!item) return null;
    return this.itemResults().find((r) => r.itemId === item.id) ?? null;
  });
  readonly revealMode = signal<RevealMode>({ anonymous: false, canAnonymise: false });
  readonly result = signal<string | null>(null);
  /** La forme du depouillement, figee sur la salle. Les cartes jouees par defaut :
   * c'est la seule lisible sur un deck a pictogrammes, ou les cartes sont muettes. */
  readonly resultLayout = signal<ResultLayout>('cards');
  readonly facilitatorPresent = signal(true);
  readonly agenda = signal<AgendaItem[]>([]);
  /** L'id du round courant, tire de l'agenda : chaque entree y est deja un id
   * de round (`realtime/services.py::build_agenda`), celle marquee 'current'
   * designe le round en cours. Necessaire pour cibler `round.configure` sur
   * CE round precis plutot que sur la room. */
  readonly currentRoundId = computed<number | null>(
    () => this.agenda().find((a) => a.status === 'current')?.id ?? null,
  );
  readonly myRole = signal<Role>('voter');
  /** Notre identifiant public, pour se reconnaitre dans les diffusions. Vide tant
   * que le premier `state.sync` n'est pas arrive. */
  readonly myParticipantId = signal('');
  readonly lastError = signal<RoomError | null>(null);
  /** Round timer (contract §timer): deadline is cosmetic-only, the server alone
   * decides when it actually causes a reveal. */
  readonly deadline = signal<string | null>(null);
  readonly timer = signal<TimerSettings>({ enabled: false, seconds: 10 });

  connect(code: string, token: string, role: Role): void {
    this.code = code.toUpperCase();
    this.token = token;
    this.myRole.set(role);
    this.manualClose = false;
    this.open();
  }

  private open(): void {
    const { wsBaseUrl } = getRuntimeConfig();
    const ws = new WebSocket(`${wsBaseUrl}/ws/rooms/${this.code}/`);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.connected.set(true);
      this.send('session.join', { participantToken: this.token });
      this.startHeartbeat();
    };
    ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data) as Envelope);
    ws.onclose = () => {
      this.connected.set(false);
      this.stopHeartbeat();
      if (!this.manualClose) this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15000);
    this.reconnectAttempts += 1;
    setTimeout(() => {
      if (!this.manualClose) this.open();
    }, delay);
  }

  disconnect(): void {
    this.manualClose = true;
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  // --- intentions (contract §4) ---
  /** Reecrit le texte de l'item courant (`item.update`). Un round tout juste
   * compose (salle neuve, ou round remis a zero) n'a encore aucun item : dans
   * ce cas on le CREE (`item.add`) au lieu d'ecrire sur un id qui n'existe pas.
   * Remplace l'ancien `subject.set`, qui faisait ce choix cote serveur. */
  setItemText(text: string) {
    const item = this.currentItem();
    if (item) {
      this.send('item.update', { itemId: item.id, text });
    } else {
      this.send('item.add', { text });
    }
  }
  /** Empile un round de plus dans la file (`round.add`), sans l'annoncer comme
   * courant. Remplace l'ancien `subject.add` — semantique differente de
   * `item.add`, qui ajoute un item au round courant plutot que d'en ouvrir un. */
  addRound(text: string) { this.send('round.add', { text }); }
  /** Fait passer un round de la file en courant (`round.select`). Remplace
   * l'ancien `subject.select` : meme valeur (l'id d'agenda designe deja un
   * round), seuls le type de message et la cle de payload changent. */
  selectRound(roundId: number) { this.send('round.select', { roundId }); }
  /** Refixe l'ordre du scenario ENTIER (`round.reorder`, tache 2) — facilitateur
   * seul. Le serveur exige la liste complete des rounds de la salle, chacun une
   * seule fois : un reordonnancement local (monter/descendre) doit donc toujours
   * envoyer la file au complet, pas un deplacement partiel. */
  reorderRounds(roundIds: number[]) { this.send('round.reorder', { roundIds }); }
  /** Retire un round du scenario (`round.remove`, tache 2) — facilitateur seul.
   * Le serveur ne retire qu'un round prepare qui n'est pas a l'ecran : ni acte
   * (il porte un Result), ni en vol, ni courant. */
  removeRound(roundId: number) { this.send('round.remove', { roundId }); }
  openVote() { this.send('vote.open', {}); }
  /** Emet `response.cast` pour l'item courant (contrat §8.2.b) — le poker ne
   * joue jamais qu'un item par round, donc une seule carte a la fois. */
  castVote(cardValue: string) {
    const item = this.currentItem();
    if (!item) return;
    // The caster may see its own choice immediately (not a secret from itself, §6.a).
    this.myResponses.update((r) => ({ ...r, [String(item.id)]: { card: cardValue } }));
    this.send('response.cast', { itemId: item.id, payload: { card: cardValue } });
  }
  reveal() { this.send('vote.reveal', {}); }
  actResult(chosenValue: string) { this.send('result.act', { chosenValue }); }
  reset() { this.send('vote.reset', {}); }
  claimFacilitator() { this.send('facilitator.claim', {}); }
  transferFacilitator(targetParticipantId: string) { this.send('facilitator.transfer', { targetParticipantId }); }
  /** Facilitator-only server-side (contract §timer); the server normalises seconds
   * (rounds then clamps) so the UI need not re-validate the grid it already offers. */
  setTimer(enabled: boolean, seconds: number) { this.send('timer.set', { enabled, seconds }); }
  selectDeck(deckId: number) { this.send('deck.select', { deckId }); }
  /** Fige le deck et/ou la config d'un round DEJA PREPARE (`round.configure`,
   * contrat SS8.3) — a la difference de `prepareRound`, ne touche qu'a ce
   * round precis, jamais au deck actif de la room. */
  configureRound(payload: RoundConfigurePayload) { this.send('round.configure', payload); }
  setRevealMode(anonymous: boolean) { this.send('reveal.setMode', { anonymous }); }
  /** Step 1 of the two-step flow: compose + announce the next round (subject + deck +
   * reveal mode + timer) atomically, leaving it idle. Opening is a separate step. */
  prepareRound(payload: {
    subjectId?: number;
    subjectText?: string;
    anonymous?: boolean;
    deckId?: number;
    timerEnabled?: boolean;
    timerSeconds?: number;
  }) {
    this.send('round.prepare', payload);
  }

  private send(type: string, payload: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const cid = `c-${Math.floor(performance.now())}-${type}`;
    this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type, payload, cid }));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => this.send('ping', {}), 20000);
  }
  private stopHeartbeat(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private onMessage(msg: Envelope): void {
    switch (msg.type) {
      case 'state.sync': return this.applyStateSync(msg.payload as StateSync);
      case 'participant.joined': {
        const p = msg.payload as ParticipantView;
        this.participants.update((list) =>
          list.some((x) => x.participantId === p.participantId) ? list : [...list, { ...p, hasVoted: false }],
        );
        return;
      }
      case 'participant.left': {
        const id = (msg.payload as { participantId: string }).participantId;
        this.participants.update((list) => list.filter((x) => x.participantId !== id));
        return;
      }
      case 'deck.changed':
        return this.deckSnapshot.set((msg.payload as { deckSnapshot: DeckSnapshot }).deckSnapshot);
      case 'round.configured':
        // `deck.changed` (rediffuse a part, seulement si le deck a reellement
        // change) est deja le message qui met a jour `deckSnapshot` : ne pas
        // le dupliquer ici. `config` n'a aucun lecteur cote front aujourd'hui
        // — le poker declare un config_schema vide (`realtime/activities.py`).
        return;
      case 'participation.update': return this.participation.set(msg.payload as Participation);
      case 'agenda.updated': {
        const agenda = (msg.payload as { agenda: AgendaItem[] }).agenda;
        this.agenda.set(agenda);
        // SEULE source qui rediffuse l'item courant aux participants deja
        // connectes : les alias herites (round.prepare, round.add...) ne
        // portent que le texte du sujet (subject.updated), jamais l'id d'item
        // que `response.cast` doit pourtant citer. `agenda.updated` accompagne
        // systematiquement tout changement de round, donc de current_id.
        const current = agenda.find((a) => a.status === 'current');
        if (current) this.items.set(current.items ?? []);
        return;
      }
      case 'subject.updated':
        this.subject.set((msg.payload as { text: string }).text);
        return;
      case 'vote.opened': {
        const p = msg.payload as { deadline: string | null };
        this.roundState.set('open');
        this.itemResults.set([]);
        this.result.set(null);
        this.myResponses.set({});
        this.deadline.set(p?.deadline ?? null);
        return;
      }
      case 'vote.revealed': {
        const p = msg.payload as RevealedPayload;
        this.roundState.set('revealed');
        this.itemResults.set(p.itemResults ?? []);
        this.revealMode.update((r) => ({ ...r, anonymous: p.anonymous }));
        // The countdown is cosmetic only: whatever the reason, the round is over.
        this.deadline.set(null);
        return;
      }
      case 'reveal.modeChanged':
        return this.revealMode.update((r) => ({ ...r, anonymous: (msg.payload as RevealMode).anonymous }));
      case 'timer.changed':
        this.timer.set(msg.payload as TimerSettings);
        return;
      case 'result.acted':
        this.roundState.set('acted');
        this.result.set((msg.payload as { chosenValue: string }).chosenValue);
        return;
      case 'vote.wasReset': {
        const next = (msg.payload as { nextState: RoundState }).nextState;
        this.roundState.set(next);
        this.itemResults.set([]);
        this.result.set(null);
        this.myResponses.set({});
        this.deadline.set(null);
        return;
      }
      case 'facilitator.changed': {
        this.facilitatorPresent.set(true);
        // Le role change pour DEUX personnes : celle qui le prend et celle qui le
        // perd. Sans cela, prendre le role rendait facilitateur aux yeux de tous
        // sauf des siens, et recharger n'y changeait rien — le role venait de la
        // session enregistree a l'arrivee.
        const nouveau = (msg.payload as { newFacilitatorId: string }).newFacilitatorId;
        const moi = this.myParticipantId();
        if (moi) this.myRole.set(nouveau === moi ? 'facilitator' : 'voter');
        return;
      }
      case 'facilitator.presence':
        this.facilitatorPresent.set((msg.payload as { present: boolean }).present);
        return;
      case 'error':
        this.lastError.set(msg.payload as RoomError);
        return;
      case 'pong':
        return;
    }
  }

  private applyStateSync(s: StateSync): void {
    this.roomTitle.set(s.room.title);
    this.isTeam.set(!!s.room.isTeam);
    this.roundState.set(s.roundState);
    this.subject.set(s.subject);
    this.deckSnapshot.set(s.deckSnapshot);
    this.availableDecks.set(s.availableDecks ?? []);
    this.participants.set(s.participants);
    // Le serveur fait autorite sur notre role : celui passe a `connect` vient de la
    // session enregistree a l'arrivee et peut etre perime (prise de role, passation).
    if (s.myRole) this.myRole.set(s.myRole);
    if (s.myParticipantId) this.myParticipantId.set(s.myParticipantId);
    this.items.set(s.items ?? []);
    this.myResponses.set(s.myResponses ?? {});
    this.result.set(s.result);
    this.resultLayout.set(s.resultLayout ?? 'cards');
    this.facilitatorPresent.set(s.facilitatorPresent);
    this.agenda.set(s.agenda ?? []);
    // Le serveur fusionne desormais `itemResults` dans state.sync pour un round
    // revele/acte (meme mecanique que les cles plates depreciees). Repli sur []
    // pour un round idle/open, qui n'en porte pas : sans lui, le depouillement
    // d'un round PRECEDENT survivrait a l'ecran d'un arrivant sur un round neuf.
    this.itemResults.set(s.itemResults ?? []);
    this.revealMode.set(s.reveal ?? { anonymous: false, canAnonymise: false });
    this.deadline.set(s.deadline ?? null);
    this.timer.set(s.timer ?? { enabled: false, seconds: 10 });
  }
}
