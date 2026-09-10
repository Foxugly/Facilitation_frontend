import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { LanguageService } from '../../../../core/i18n/language.service';
import { RoomSocketService } from '../../../../core/realtime/room-socket.service';
import { SnapshotCard } from '../../../../core/realtime/protocol';
import { resolveActivity } from '../activity-registry';

const TIMER_DURATIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

/**
 * Panneau de controle du facilitateur pour l'activite Delegation Poker.
 *
 * Extrait de `room.component` (etape 3a) : c'est la part la plus autonome de
 * l'activite. Le composant injecte `RoomSocketService` DIRECTEMENT plutot que de
 * recevoir l'etat par des `input()` — le service est deja partage a l'echelle de
 * la salle, et le faire transiter par le parent n'aurait fait que recreer le
 * couplage qu'on cherche a defaire.
 *
 * Il ne porte que des BROUILLONS locaux (`*Draft`) : rien n'est envoye au serveur
 * avant `prepare()`, qui applique le sujet et les trois reglages d'un seul tenant.
 * C'est ce qui evite qu'un reglage bascule sous des votes deja emis.
 *
 * Le parent reste responsable de l'affichage du panneau : il ne rend ce composant
 * que pour un facilitateur.
 */
@Component({
  selector: 'app-delegation-poker-facilitator-panel',
  standalone: true,
  imports: [
    FormsModule, TranslocoModule, ButtonModule, InputNumberModule, InputTextModule,
    SelectModule, ToggleSwitchModule,
  ],
  templateUrl: './facilitator-panel.component.html',
  styleUrl: './facilitator-panel.component.scss',
})
export class DelegationPokerFacilitatorPanelComponent {
  readonly socket = inject(RoomSocketService);
  private transloco = inject(TranslocoService);
  private language = inject(LanguageService);

  readonly lang = this.language.active;
  readonly state = this.socket.roundState;

  /** Ce que l'activite courante DECLARE proposer, plutot qu'une liste d'options
   * codee ici. Une activite sans notion de duree ne declare pas `timer`, et le
   * reglage disparait sans qu'on ait a le prevoir dans ce composant.
   *
   * La declaration ne se substitue pas au DROIT : une option n'apparait que si
   * l'activite l'expose ET que la salle y a droit (equipe, offre payante). Le
   * registre dit ce qui est possible, le serveur ce qui est permis. */
  private readonly activity = computed(() => resolveActivity(this.socket.deckSnapshot()?.voteType));
  readonly offersDeck = computed(() => this.activity().teamOptions.includes('deck'));
  readonly offersAnonymous = computed(() => this.activity().teamOptions.includes('anonymous'));
  readonly offersTimer = computed(() => this.activity().teamOptions.includes('timer'));

  // --- Brouillons locaux, appliques ensemble par prepare() -------------------
  readonly subjectDraft = signal('');
  readonly chosenValue = signal<string | null>(null);
  readonly deckDraft = signal<number | null>(null);
  readonly anonymousDraft = signal(false);
  readonly timerEnabledDraft = signal(false);
  readonly timerSecondsDraft = signal(TIMER_DURATIONS[0]);
  readonly editing = signal(false);

  // --- Etats derives ---------------------------------------------------------
  readonly canOpen = computed(() => this.state() === 'idle' && this.socket.subject().trim().length > 0);
  readonly canReveal = computed(() => this.state() === 'open' && this.socket.participation().voted >= 1);

  readonly availableDecks = computed(() => this.socket.availableDecks());
  readonly currentDeckId = computed(() => this.socket.deckSnapshot()?.deckId ?? null);
  readonly canSwitchDeck = computed(() => this.state() === 'idle' || this.state() === 'acted');
  readonly deckOptions = computed(() =>
    this.availableDecks().map((d) => ({
      value: d.deckId,
      label: this.transloco.translate(`room.deck.type.${d.voteType}`),
    })),
  );

  readonly canSetRevealMode = computed(() => this.state() === 'idle');
  /** Vote ouvert = panneau fige : les reglages ne doivent pas changer sous des
   * gens en train de voter. */
  readonly panelFrozen = computed(() => this.state() === 'open');

  // Panneau en deux temps : composition tant qu'aucun round n'est annonce, puis
  // lancement. Une salle neuve (sans sujet) demarre toujours sur la composition.
  readonly showComposeForm = computed(
    () => this.state() === 'idle' && (this.editing() || this.socket.subject().trim().length === 0),
  );
  readonly showPrepared = computed(() => this.state() === 'idle' && !this.showComposeForm());
  readonly canPrepare = computed(() => this.subjectDraft().trim().length > 0);

  /** On acte sur le NOM du niveau, pas sur le nombre. */
  readonly cardOptions = computed(() =>
    (this.socket.deckSnapshot()?.cards ?? []).map((c) => ({ value: c.value, label: this.cardName(c) })),
  );

  /** Unite localisee affichee dans le champ du timer. Depend de la revision de
   * langue pour se re-resoudre au changement ET a l'arrivee du catalogue. */
  readonly timerSuffix = computed(() => {
    this.language.revision();
    return this.transloco.translate('room.timer.sec_suffix');
  });

  constructor() {
    // Propose le mode des votes reveles comme valeur actee par defaut (design §4).
    effect(() => {
      if (this.state() === 'revealed' && this.chosenValue() === null) {
        this.chosenValue.set(this.modeValue());
      }
    });
    // Aligne les brouillons de timer sur le reglage serveur, qui fait autorite :
    // reflete aussi le changement d'un autre facilitateur, ou une normalisation.
    effect(() => {
      const t = this.socket.timer();
      this.timerEnabledDraft.set(t.enabled);
      this.timerSecondsDraft.set(t.seconds);
    });
  }

  cardName(card: SnapshotCard | null): string {
    if (!card) return '';
    const layer = card.layers.find((l) => l.kind === 'i18n');
    if (!layer) return card.value;
    const t = layer.text;
    if (typeof t === 'string') return t;
    return t[this.lang()] ?? t['en'] ?? Object.values(t)[0] ?? card.value;
  }

  cardByValue(value: string): SnapshotCard | null {
    return this.socket.deckSnapshot()?.cards.find((c) => c.value === value) ?? null;
  }

  agendaResultName(value: string): string {
    return this.cardName(this.cardByValue(value)) || value;
  }

  /** La valeur la plus jouee, proposee par defaut a la globalisation. */
  private modeValue(): string | null {
    let best: string | null = null;
    let bestCount = -1;
    for (const { cardValue, count } of this.socket.voteTally()) {
      if (count > bestCount) {
        best = cardValue;
        bestCount = count;
      }
    }
    return best;
  }

  // --- Les controles de composition ne touchent que des brouillons -----------
  onRevealModeChange(anonymous: boolean): void {
    this.anonymousDraft.set(anonymous);
  }

  onDeckChange(deckId: number): void {
    this.deckDraft.set(deckId);
  }

  onTimerEnabledChange(enabled: boolean): void {
    this.timerEnabledDraft.set(enabled);
  }

  onTimerSecondsChange(seconds: number | null): void {
    if (seconds == null || Number.isNaN(seconds)) return;
    this.timerSecondsDraft.set(seconds);
  }

  /** Les brouillons de detail, en fragment de payload prepareRound. Les options
   * reservees aux equipes ne sont simplement pas envoyees par une salle anonyme. */
  private roundDetails() {
    const isTeam = this.socket.isTeam();
    return {
      deckId: (this.deckDraft() ?? this.currentDeckId()) ?? undefined,
      anonymous: this.socket.revealMode().canAnonymise ? this.anonymousDraft() : undefined,
      timerEnabled: isTeam ? this.timerEnabledDraft() : undefined,
      timerSeconds: isTeam ? this.timerSecondsDraft() : undefined,
    };
  }

  /** Etape 1 : annonce le round compose (sujet + details) — reste idle. */
  prepare(): void {
    const text = this.subjectDraft().trim();
    if (!text) return;
    this.socket.prepareRound({ subjectText: text, ...this.roundDetails() });
    this.editing.set(false);
  }

  /** Prend un sujet de la file et l'annonce avec les details courants. */
  selectAgenda(subjectId: number): void {
    this.socket.prepareRound({ subjectId, ...this.roundDetails() });
    this.editing.set(false);
  }

  /** Etape 2 : ouvre les votes sur le round annonce. */
  launch(): void {
    this.socket.openVote();
  }

  /** Rouvre la composition d'un round annonce, pre-remplie depuis le direct. */
  enterCompose(): void {
    this.subjectDraft.set(this.socket.subject());
    this.deckDraft.set(this.currentDeckId());
    this.anonymousDraft.set(this.socket.revealMode().anonymous);
    this.editing.set(true);
  }

  /** Empile un sujet dans la file SANS annoncer de round : c'est la difference
   * avec prepare(), qui le rend courant immediatement. */
  queueSubject(): void {
    const text = this.subjectDraft().trim();
    if (!text) return;
    this.socket.addSubject(text);
    this.subjectDraft.set('');
  }

  act(): void {
    const value = this.chosenValue();
    if (value) this.socket.actResult(value);
  }
}
