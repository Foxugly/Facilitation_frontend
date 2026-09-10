import { Injectable, signal } from '@angular/core';

import { getRuntimeConfig } from '../runtime-config';
import {
  AgendaItem,
  AvailableDeck,
  DeckSnapshot,
  Envelope,
  Participation,
  ParticipantView,
  PROTOCOL_VERSION,
  Role,
  RoomError,
  ResultLayout,
  RoundState,
  StateSync,
  TimerSettings,
  NominativeVote,
  RevealMode,
  VoteTally,
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
  readonly myVote = signal<string | null>(null);
  /** Per-value vote count once a round is revealed. */
  readonly voteTally = signal<VoteTally[]>([]);
  /** Who voted what — populated only for a nominative round. An anonymous round
   * leaves this empty because the server never sent the link, not because the UI
   * hides it. */
  readonly nominativeVotes = signal<NominativeVote[]>([]);
  readonly revealMode = signal<RevealMode>({ anonymous: false, canAnonymise: false });
  readonly spread = signal<{ min: number | null; max: number | null }>({ min: null, max: null });
  readonly result = signal<string | null>(null);
  /** La forme du depouillement, figee sur la salle. Les cartes jouees par defaut :
   * c'est la seule lisible sur un deck a pictogrammes, ou les cartes sont muettes. */
  readonly resultLayout = signal<ResultLayout>('cards');
  readonly facilitatorPresent = signal(true);
  readonly agenda = signal<AgendaItem[]>([]);
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
  setSubject(text: string) { this.send('subject.set', { text }); }
  addSubject(text: string) { this.send('subject.add', { text }); }
  selectSubject(subjectId: number) { this.send('subject.select', { subjectId }); }
  openVote() { this.send('vote.open', {}); }
  castVote(cardValue: string) {
    // The caster may see its own choice immediately (not a secret from itself, §6.a).
    this.myVote.set(cardValue);
    this.send('vote.cast', { cardValue });
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
      case 'participation.update': return this.participation.set(msg.payload as Participation);
      case 'agenda.updated':
        this.agenda.set((msg.payload as { agenda: AgendaItem[] }).agenda);
        return;
      case 'subject.updated':
        this.subject.set((msg.payload as { text: string }).text);
        return;
      case 'vote.opened': {
        const p = msg.payload as { deadline: string | null };
        this.roundState.set('open');
        this.voteTally.set([]);
        this.result.set(null);
        this.myVote.set(null);
        this.deadline.set(p?.deadline ?? null);
        return;
      }
      case 'vote.revealed': {
        const p = msg.payload as {
          tally: VoteTally[];
          votes?: NominativeVote[];
          anonymous: boolean;
          spread: { min: number | null; max: number | null };
          reason?: 'timeout' | 'facilitator';
        };
        this.roundState.set('revealed');
        this.voteTally.set(p.tally);
        this.nominativeVotes.set(p.votes ?? []);
        this.revealMode.update((r) => ({ ...r, anonymous: p.anonymous }));
        this.spread.set(p.spread);
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
        this.voteTally.set([]);
        this.result.set(null);
        this.myVote.set(null);
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
    this.myVote.set(s.myVote);
    this.result.set(s.result);
    this.resultLayout.set(s.resultLayout ?? 'cards');
    this.facilitatorPresent.set(s.facilitatorPresent);
    this.agenda.set(s.agenda ?? []);
    this.voteTally.set(s.tally ?? []);
    this.nominativeVotes.set(s.votes ?? []);
    this.spread.set(s.spread ?? { min: null, max: null });
    this.revealMode.set(s.reveal ?? { anonymous: false, canAnonymise: false });
    this.deadline.set(s.deadline ?? null);
    this.timer.set(s.timer ?? { enabled: false, seconds: 10 });
  }
}
