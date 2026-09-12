import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { LanguageService } from '../../../../core/i18n/language.service';
import { RoomSocketService } from '../../../../core/realtime/room-socket.service';
import { AgendaItem, ChainRule, SnapshotCard } from '../../../../core/realtime/protocol';
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
    FormsModule, TranslocoModule, ButtonModule, CheckboxModule, InputNumberModule, InputTextModule,
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

  // --- Chainage (design §7, contrat §8.5) -------------------------------------
  // Declare une liaison depuis le round DEJA courant (etape 2, "round-ready") :
  // round.bind exige un roundId, qui n'existe qu'une fois le round compose.
  readonly chainEnabled = signal(false);
  readonly chainSourceDraft = signal<number | null>(null);
  readonly chainTakeDraft = signal<'items' | 'results'>('items');
  readonly chainModeDraft = signal<'auto' | 'manual'>('auto');
  readonly chainTopDraft = signal<number | null>(null);
  /** Coche localement, avant validation (`resolveChain`). Remise a zero par
   * `bindChain` (une nouvelle liaison rend toute coche anterieure hors-sujet)
   * et par `resolveChain` (la selection vient d'etre consommee) — deux points
   * d'application explicites plutot qu'un effet reactif sur la liste de
   * candidats, qui aurait exige un cycle de detection de changements pour
   * rien (aucun rendu n'en depend avant que le facilitateur ne coche a
   * nouveau). */
  readonly chainChecked = signal<ReadonlySet<number>>(new Set());

  /** Round proposables comme source : n'importe quelle AUTRE entree du
   * scenario (round.bind refuse `roundId === sourceRoundId`) — un round jamais
   * ouvert porte deja au moins un item (son sujet), un round encore ouvert est
   * une source valide (design §7 : "copier depuis un round encore ouvert est
   * autorise"). Rien d'autre a filtrer ici : le serveur reste seul juge de la
   * compatibilite reelle (registre consumes/produces), que ce composant ne
   * connait pas round par round. */
  readonly chainSourceOptions = computed(() =>
    this.socket.agenda()
      .filter((a) => a.id !== this.socket.currentRoundId())
      .map((a) => ({ value: a.id, label: a.text || `#${a.id}`, everDecided: a.everDecided })),
  );
  /** Cette activite consomme-t-elle quelque chose ? Une activite future
   * `consumes: 'none'` n'a rien ou poser une copie — le geste ne doit alors
   * meme pas etre propose (regle tenue tout du long de ce programme). */
  readonly chainOffered = computed(
    () => this.activity().consumes !== 'none' && this.chainSourceOptions().length > 0,
  );
  /** La source choisie a-t-elle deja produit un resultat au moins une fois ?
   * Approximation cote client (le detail du registre par round n'est pas
   * expose au front) : `take: "results"` n'est offert que si oui, pour ne pas
   * proposer un geste que le serveur refuserait presque a coup sur. */
  readonly chainSourceEverDecided = computed(
    () => this.chainSourceOptions().find((o) => o.value === this.chainSourceDraft())?.everDecided ?? false,
  );
  readonly canBindChain = computed(() => this.chainSourceDraft() !== null);
  /** `results` n'apparait dans la liste que si la source l'autorise (voir
   * `chainSourceEverDecided`) — le geste ne doit pas etre offert sinon. */
  readonly chainTakeOptions = computed(() => {
    const values: ('items' | 'results')[] = this.chainSourceEverDecided() ? ['items', 'results'] : ['items'];
    return values.map((value) => ({ value, label: this.transloco.translate(`room.chain.take.${value}`) }));
  });
  /** La valeur EFFECTIVEMENT applicable de `take` — jamais "results" si la
   * source choisie ne l'autorise pas (voir `chainSourceEverDecided`), meme si
   * le brouillon le porte encore (ex. la source vient de changer). Purement
   * derive : aucun effet correcteur necessaire, ni pour l'affichage (le
   * select y est lie), ni pour `bindChain`, qui s'y refere aussi — le geste
   * impossible n'est donc jamais ni montre ni envoye. */
  readonly effectiveChainTake = computed<'items' | 'results'>(() =>
    this.chainTakeDraft() === 'results' && this.chainSourceEverDecided() ? 'results' : 'items',
  );
  readonly chainModeOptions = computed(() =>
    (['auto', 'manual'] as const).map((value) => ({ value, label: this.transloco.translate(`room.chain.mode.${value}`) })),
  );
  /** Les candidats du round courant, s'il est lie en mode manuel et pas encore
   * resolu (contrat §8.5.a) — pilote l'affichage de l'ecran de selection,
   * qu'un rechargement retrouve aussi bien qu'une declaration fraiche. */
  readonly chainCandidates = computed(() => this.socket.currentChainingCandidates());

  /** Bascule un candidat coche/decoche (etape manuelle, pas de glisser-depose —
   * decision de conception, tactile). */
  toggleChainCandidate(sourceItemId: number, checked: boolean): void {
    this.chainChecked.update((set) => {
      const next = new Set(set);
      if (checked) next.add(sourceItemId);
      else next.delete(sourceItemId);
      return next;
    });
  }

  isChainCandidateChecked(sourceItemId: number): boolean {
    return this.chainChecked().has(sourceItemId);
  }

  onChainSourceChange(sourceRoundId: number): void {
    this.chainSourceDraft.set(sourceRoundId);
  }

  onChainTakeChange(take: 'items' | 'results'): void {
    this.chainTakeDraft.set(take);
    if (take !== 'results') this.chainTopDraft.set(null);
  }

  onChainModeChange(mode: 'auto' | 'manual'): void {
    this.chainModeDraft.set(mode);
  }

  onChainTopChange(top: number | null): void {
    this.chainTopDraft.set(top == null || Number.isNaN(top) ? null : top);
  }

  /** Declare la liaison (`round.bind`), puis force sa resolution : le round
   * cible est ICI TOUJOURS DEJA courant (etape 2), donc `round.bind` seul ne
   * declenche rien (la resolution auto ne se joue qu'au moment ou un round
   * DEVIENT courant, cote serveur). Redemander sa selection (`selectRound`)
   * reproduit exactement ce declenchement — sans effet destructeur, le round
   * etant deja idle — et c'est le meme mecanisme que celui documente cote
   * serveur pour un facilitateur qui rechargerait sur un round manuel non
   * resolu (state-sync-candidates-report.md). */
  bindChain(): void {
    const roundId = this.socket.currentRoundId();
    const sourceRoundId = this.chainSourceDraft();
    if (roundId === null || sourceRoundId === null) return;
    const take = this.effectiveChainTake();
    const rule: ChainRule = {
      take,
      mode: this.chainModeDraft(),
      top: take === 'results' ? this.chainTopDraft() : null,
    };
    this.socket.bindRound(roundId, sourceRoundId, rule);
    this.socket.selectRound(roundId);
    // Une nouvelle liaison rend toute coche anterieure hors-sujet (elle visait
    // une liste de candidats perimee, ou aucune liste du tout).
    this.chainChecked.set(new Set());
  }

  /** Valide la selection cochee (`round.resolve`) — sourceItemIds desigent des
   * items DE LA SOURCE (contrat §8.5), jamais les ids du round courant. */
  resolveChain(): void {
    const roundId = this.socket.currentRoundId();
    if (roundId === null) return;
    this.socket.resolveChaining(roundId, [...this.chainChecked()]);
    this.chainChecked.set(new Set());
  }

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
    for (const { cardValue, count } of this.socket.currentItemResult()?.tally ?? []) {
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

  /** Etape 1 : annonce le round compose (sujet + details) — reste idle.
   *
   * Editer un round DEJA prepare (`editing()`) ne fait plus passer le deck
   * par `round.prepare` : cette intention applique aussi le deck au niveau de
   * la ROOM (`select_deck`), donc a tous les rounds a venir qui n'en
   * choisiraient pas un explicitement — c'est le bug que `round.configure`
   * corrige (design 5c) en figeant le deck sur CE round precis, sans toucher
   * au sujet ni au reste. Composer un round tout neuf n'a pas encore de
   * roundId a cibler : le deck y reste porte par `round.prepare`, comme avant. */
  prepare(): void {
    const text = this.subjectDraft().trim();
    if (!text) return;
    const editingRoundId = this.editing() ? this.socket.currentRoundId() : null;
    const { deckId, ...details } = this.roundDetails();
    this.socket.prepareRound({ subjectText: text, ...details, ...(editingRoundId == null ? { deckId } : {}) });
    if (editingRoundId != null && deckId != null && deckId !== this.currentDeckId()) {
      this.socket.configureRound({ roundId: editingRoundId, deckId });
    }
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
    this.socket.addRound(text);
    this.subjectDraft.set('');
  }

  act(): void {
    const value = this.chosenValue();
    if (value) this.socket.actResult(value);
  }

  // --- Scenario : reordonnancement et elagage (tache 2) -----------------------
  isFirst(index: number): boolean {
    return index === 0;
  }

  isLast(index: number): boolean {
    return index === this.socket.agenda().length - 1;
  }

  /** La regle complete du serveur, reproduite telle quelle (services.py::remove_round) :
   * on ne retire qu'un round PREPARE (`state === 'idle'`), JAMAIS DECIDE
   * (`everDecided === false`), et qui n'est pas l'entree courante (couvert par
   * `status === 'pending'`, qui exclut `current` comme `done`). `status` seul
   * confondait un round jamais ouvert avec un round ouvert puis abandonne
   * (`state` corrige ce cas) ET avec un round acte puis reinitialise par
   * `vote.reset` -- celui-ci redevient `status: 'pending'` / `state: 'idle'`
   * tout en portant toujours un `Result` en base (`everDecided` couvre ce
   * second cas). Liste blanche sur les TROIS cles (aucune negation) :
   * extensible sans remaniement si un nouveau statut/etat apparait. */
  isRemovable(item: AgendaItem): boolean {
    return item.status === 'pending' && item.state === 'idle' && item.everDecided === false;
  }

  /** `round.reorder` exige la liste COMPLETE, dans l'ordre voulu : monter ou
   * descendre une entree se traduit donc par un recalcul local de la file
   * entiere, envoyee telle que l'utilisateur vient de la voir (pas l'etat
   * precedent). */
  private moveRound(index: number, delta: number): void {
    const roundIds = this.socket.agenda().map((a) => a.id);
    const target = index + delta;
    if (target < 0 || target >= roundIds.length) return;
    [roundIds[index], roundIds[target]] = [roundIds[target], roundIds[index]];
    this.socket.reorderRounds(roundIds);
  }

  moveUp(index: number): void {
    this.moveRound(index, -1);
  }

  moveDown(index: number): void {
    this.moveRound(index, 1);
  }

  removeRound(roundId: number): void {
    this.socket.removeRound(roundId);
  }
}
