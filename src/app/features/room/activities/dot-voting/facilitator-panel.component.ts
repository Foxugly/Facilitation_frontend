import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { RoomSocketService } from '../../../../core/realtime/room-socket.service';
import { resolveActivity } from '../activity-registry';

const TIMER_DURATIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

/** Une ligne de "reste a placer", reservee au facilitateur (contrat §8.7,
 * design §4) : les jetons n'etant pas obligatoires, "a fini" ne se deduit
 * plus du seul nombre de reponses. */
interface PendingRow {
  participantId: string;
  name: string;
  remaining: number;
}

/**
 * Panneau de controle du facilitateur pour l'activite Dot Voting.
 *
 * Meme decoupage que le poker (delegation-poker/facilitator-panel.component.ts) :
 * injecte `RoomSocketService` directement, ne porte que des brouillons locaux
 * pour la composition. Deux differences de fond avec le poker :
 *
 * - la composition d'un round ici est une LISTE d'items (N, design §1), pas un
 *   sujet unique : chaque ajout/retrait/reordonnancement part immediatement au
 *   serveur (`item.add`/`item.remove`/`item.reorder`) plutot que d'attendre un
 *   `prepare()` global — il n'y a rien a batcher, chaque geste est deja valide
 *   independamment cote serveur ;
 * - le reglage de visibilite des totaux (`Round.config.liveTotals`, design §5)
 *   n'existe pas cote poker : c'est la premiere fois que ce panneau ecrit dans
 *   `Round.config` via `round.configure` (contrat §8.3).
 *
 * Volontairement HORS PERIMETRE de cette livraison (voir task-6-report.md) :
 * pas de selecteur de deck ici (on bascule VERS dot_voting depuis le panneau
 * poker), pas de chainage (`round.bind`/`round.resolve` restent poker-only
 * pour l'instant), pas de "mettre en file sans lancer" (`round.add`).
 */
@Component({
  selector: 'app-dot-voting-facilitator-panel',
  standalone: true,
  imports: [FormsModule, TranslocoModule, ButtonModule, InputNumberModule, InputTextModule, ToggleSwitchModule],
  templateUrl: './facilitator-panel.component.html',
  styleUrl: './facilitator-panel.component.scss',
})
export class DotVotingFacilitatorPanelComponent {
  readonly socket = inject(RoomSocketService);

  readonly state = this.socket.roundState;
  readonly items = this.socket.items;
  readonly itemCount = computed(() => this.items().length);

  // --- Composition : round pas encore cree (aucun item) -----------------------
  readonly showCompose = computed(() => this.state() === 'idle' && this.itemCount() === 0);
  readonly showReady = computed(() => this.state() === 'idle' && this.itemCount() > 0);

  readonly firstItemDraft = signal('');
  readonly anonymousDraft = signal(false);
  readonly timerEnabledDraft = signal(false);
  readonly timerSecondsDraft = signal(TIMER_DURATIONS[0]);
  readonly canPrepare = computed(() => this.firstItemDraft().trim().length > 0);

  /** Ce que l'activite courante DECLARE proposer (meme lecture que le poker,
   * facilitator-panel.component.ts) -- ce panneau ne rend que pour dot_voting,
   * mais lire le registre plutot que coder `true` en dur garde une seule
   * source de verite si `teamOptions` change un jour. */
  private readonly activity = computed(() => resolveActivity(this.socket.deckSnapshot()?.voteType));
  readonly offersAnonymous = computed(() => this.activity().teamOptions.includes('anonymous'));
  readonly offersTimer = computed(() => this.activity().teamOptions.includes('timer'));

  /** Etape 1 : cree le round avec son premier item -- reste `idle`, pas encore
   * de deck a choisir ici (ce panneau ne rend QUE si le deck courant de la
   * room est deja dot_voting, voir activity-registry.ts). */
  prepare(): void {
    const text = this.firstItemDraft().trim();
    if (!text) return;
    const isTeam = this.socket.isTeam();
    this.socket.prepareRound({
      subjectText: text,
      anonymous: this.socket.revealMode().canAnonymise ? this.anonymousDraft() : undefined,
      timerEnabled: isTeam ? this.timerEnabledDraft() : undefined,
      timerSeconds: isTeam ? this.timerSecondsDraft() : undefined,
    });
    this.firstItemDraft.set('');
  }

  onRevealModeChange(anonymous: boolean): void {
    this.anonymousDraft.set(anonymous);
  }

  onTimerEnabledChange(enabled: boolean): void {
    this.timerEnabledDraft.set(enabled);
  }

  onTimerSecondsChange(seconds: number | null): void {
    if (seconds == null || Number.isNaN(seconds)) return;
    this.timerSecondsDraft.set(seconds);
  }

  // --- Etape 2 : le round existe, ses items restent modifiables (idle) -------
  readonly newItemDraft = signal('');
  /** Ne jamais proposer de vider le round : n = 0 casserait le budget (2n = 0). */
  readonly canRemoveItem = computed(() => this.itemCount() > 1);

  addItem(): void {
    const text = this.newItemDraft().trim();
    if (!text) return;
    this.socket.addItem(text);
    this.newItemDraft.set('');
  }

  removeItem(itemId: number): void {
    if (!this.canRemoveItem()) return;
    this.socket.removeItem(itemId);
  }

  isFirst(index: number): boolean {
    return index === 0;
  }

  isLast(index: number): boolean {
    return index === this.items().length - 1;
  }

  private moveItem(index: number, delta: number): void {
    const itemIds = this.items().map((i) => i.id);
    const target = index + delta;
    if (target < 0 || target >= itemIds.length) return;
    [itemIds[index], itemIds[target]] = [itemIds[target], itemIds[index]];
    this.socket.reorderItems(itemIds);
  }

  moveUp(index: number): void {
    this.moveItem(index, -1);
  }

  moveDown(index: number): void {
    this.moveItem(index, 1);
  }

  /** Reglage de visibilite des totaux (design §5, contrat §8.3/§8.7) --
   * TROIS etats, jamais deux (round de correction 1, point 3) : `on`/`off`
   * connus (le facilitateur les a poses CETTE connexion-ci, ou le serveur
   * les a confirmes dans `state.sync`), et `unknown` -- avant ce correctif,
   * un reglage inconnu s'affichait comme "off", une FAUSSE ASSURANCE sur un
   * reglage de confidentialite : le facilitateur pouvait ouvrir le vote en
   * croyant les totaux secrets alors que le serveur les gardait visibles
   * depuis un reglage anterieur a un rechargement. `unknown` doit inviter a
   * reposer le reglage, jamais laisser croire qu'il vaut "off". Settable
   * seulement `idle` (le serveur refuse `round.configure` sur un round deja
   * ouvert). */
  readonly liveTotalsState = computed<'on' | 'off' | 'unknown'>(() => {
    const v = this.socket.roundConfig()['liveTotals'];
    if (v === true) return 'on';
    if (v === false) return 'off';
    return 'unknown';
  });

  toggleLiveTotals(checked: boolean): void {
    const roundId = this.socket.currentRoundId();
    if (roundId === null) return;
    this.socket.configureRound({ roundId, config: { liveTotals: checked } });
  }

  launch(): void {
    this.socket.openVote();
  }

  // --- Etape 3 : le round est ouvert -------------------------------------------
  readonly canReveal = computed(() => this.state() === 'open' && this.socket.participation().voted >= 1);

  /** Ce qu'il reste a placer par participant (contrat §8.7, design §4) --
   * `null` tant qu'aucune reponse n'a encore ete posee sur ce round (le
   * serveur ne diffuse `response.pending` qu'apres un `response.cast`), pas
   * une absence de budget : le poker, lui, ne declare aucune notion de
   * budget et ce signal resterait `null` tout du long. */
  readonly pendingRows = computed<PendingRow[]>(() => {
    const remaining = this.socket.pendingBudgets();
    if (!remaining) return [];
    const names = new Map(this.socket.participants().map((p) => [p.participantId, p.username]));
    return Object.entries(remaining).map(([participantId, value]) => ({
      participantId,
      name: names.get(participantId) ?? participantId,
      remaining: value,
    }));
  });

  reveal(): void {
    this.socket.reveal();
  }

  // --- Etape 4 : revele -- conclure fige deja le classement (contrat §8.6) ----
  /** Dot Voting fige son classement A LA REVELATION : conclure n'envoie AUCUNE
   * valeur (contrat §8.6, "chosenValue attendu absent/null") -- a la
   * difference du poker, aucune carte a choisir ici. */
  conclude(): void {
    this.socket.actResult();
  }

  reset(): void {
    this.socket.reset();
  }
}
