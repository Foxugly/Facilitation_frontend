import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { LanguageService } from '../../../../core/i18n/language.service';
import { secondsLeft } from '../../../../core/realtime/countdown';
import { RoomSocketService } from '../../../../core/realtime/room-socket.service';
import { RoundState, SnapshotCard } from '../../../../core/realtime/protocol';
import { DelegationCardComponent } from '../../../../shared/ui/delegation-card/delegation-card.component';
import { DelegationDeckComponent } from '../../../../shared/ui/delegation-deck/delegation-deck.component';

interface Seat {
  participantId: string;
  username: string;
  role: string;
  card: SnapshotCard | null;
  show: boolean;     // la personne a vote
  revealed: boolean; // carte face visible — revelation nominative seulement
}

const BADGE_SEVERITY: Record<RoundState, 'secondary' | 'success' | 'warn' | 'info'> = {
  idle: 'secondary',
  open: 'success',
  revealed: 'warn',
  acted: 'info',
};

/**
 * Le plateau de l'activite Delegation Poker : sujet et etat du round, tapis et
 * sieges, main du joueur, depouillement.
 *
 * Extrait de `room.component` (etape 3b). Comme le panneau facilitateur, il
 * injecte `RoomSocketService` directement plutot que de recevoir l'etat par des
 * `input()`.
 *
 * Les variables CSS de dimensionnement restent posees par le shell sur `.room`
 * et `.room-body` : les custom properties HERITENT en cascade, l'encapsulation
 * Angular ne portant que sur les selecteurs.
 */
@Component({
  selector: 'app-delegation-poker-table',
  standalone: true,
  imports: [TranslocoModule, TagModule, TooltipModule, DelegationDeckComponent, DelegationCardComponent],
  templateUrl: './table.component.html',
  styleUrl: './table.component.scss',
})
export class DelegationPokerTableComponent {
  readonly socket = inject(RoomSocketService);
  private language = inject(LanguageService);
  private destroyRef = inject(DestroyRef);

  readonly lang = this.language.active;
  readonly isFacilitator = computed(() => this.socket.myRole() === 'facilitator');
  private countdownHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Compte a rebours purement cosmetique : la revelation est prononcee par le
    // serveur (raison « timeout »), jamais par ce minuteur.
    effect(() => {
      const deadline = this.socket.deadline();
      this.stopCountdown();
      if (deadline) {
        this.remainingSeconds.set(secondsLeft(deadline));
        this.countdownHandle = setInterval(() => this.remainingSeconds.set(secondsLeft(this.socket.deadline())), 1000);
      } else {
        this.remainingSeconds.set(null);
      }
    });
    this.destroyRef.onDestroy(() => this.stopCountdown());
  }

  private stopCountdown(): void {
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = null;
    }
  }

  readonly state = this.socket.roundState;

  readonly badgeSeverity = computed(() => BADGE_SEVERITY[this.state()]);

  readonly votable = computed(() => this.state() === 'open');

  /** Ma reponse a l'item courant du round (design N-items, §5) — remplace
   * l'ancien `socket.myVote()`, qui ne portait qu'une valeur pour tout le
   * round. Le poker n'en joue jamais qu'un, mais on lit deja au singulier. */
  readonly myResponse = computed<string | null>(() => {
    const item = this.socket.currentItem();
    return item ? (this.socket.myResponses()[String(item.id)]?.card ?? null) : null;
  });

  /** L'ecart de l'item courant, une fois revele — remplace `socket.spread()`. */
  readonly spread = computed(() => this.socket.currentItemResult()?.spread ?? { min: null, max: null });


  // --- Round timer (contract §timer): the countdown is purely cosmetic, the
  // interval only runs while a deadline exists and stops on reveal/destroy.
  readonly remainingSeconds = signal<number | null>(null);

  /** Une entree par participant, dans l'ordre de la salle. La geometrie polaire
   * de l'ancien tapis (angles, coordonnees, ecartement) n'a plus d'objet : la
   * liste se contente de l'ordre. */
  readonly seats = computed<Seat[]>(() => {
    const revealed = this.state() === 'revealed' || this.state() === 'acted';
    const anonymous = this.socket.revealMode().anonymous;
    const votes = this.socket.currentItemResult()?.votes ?? [];
    const byParticipant = new Map(votes.map((v) => [v.participantId, v.cardValue]));
    return this.socket.participants().map((p) => {
      const value = byParticipant.get(p.participantId);
      const voted = this.socket.participation().votedIds.includes(p.participantId);
      return {
        participantId: p.participantId,
        username: p.username,
        role: p.role,
        card: value ? this.cardByValue(value) : null,
        show: voted,
        revealed: revealed && !anonymous && !!value,
      };
    });
  });
  readonly cardBackColor = computed(
    () => this.socket.deckSnapshot()?.cardBack?.color ?? this.socket.deckSnapshot()?.theme?.cardBackColor ?? null,
  );

  /** Null when the team chose a flat colour: the card then shows the colour alone. */
  readonly cardBackImage = computed(() => {
    const back = this.socket.deckSnapshot()?.cardBack;
    return back?.style === 'image' ? back.image : null;
  });




  /** The hand only appears once a round has been prepared (subject announced) —
   * before that there is nothing to vote on and the cards would just be noise.
   * Elle disparait a la revelation : les cartes cessent d'etre jouables, et le
   * depouillement prend sa place (voir outcomeVisible). */
  readonly handVisible = computed(
    () => this.socket.subject().trim().length > 0 && !this.outcomeVisible(),
  );


  /** Le depouillement occupe la bande de la main des que les votes sont reveles, puis
   * cede a la carte retenue une fois la decision prise. Il tenait jusqu'ici dans un
   * encart de 210px au centre du tapis, ou les cartes des sieges lui passaient dessus
   * et ou les noms des votants se noyaient dans le vert. */
  readonly outcomeVisible = computed(() => this.state() === 'revealed' || this.state() === 'acted');

  /** Une entree par valeur jouee : la carte, son nombre de voix, et qui l'a jouee.
   * Triee par nombre de voix decroissant — la majorite se lit alors en premier, dans
   * les deux mises en page. */
  readonly outcomeGroups = computed(() => {
    const noms = new Map(this.socket.participants().map((p) => [p.participantId, p.username]));
    const result = this.socket.currentItemResult();
    const votants = result?.votes ?? [];
    return (result?.tally ?? [])
      .map((t) => ({
        value: t.cardValue,
        card: this.cardByValue(t.cardValue),
        name: this.cardName(this.cardByValue(t.cardValue)) || t.cardValue,
        count: t.count,
        // Vide sur un round anonyme : le serveur n'a jamais envoye le lien
        // participant -> carte, ce n'est pas l'interface qui le cache.
        voters: votants
          .filter((v) => v.cardValue === t.cardValue)
          .map((v) => noms.get(v.participantId) ?? '?')
          .join(', '),
      }))
      .sort((a, b) => b.count - a.count);
  });

  /** La part de la plus grosse pile, pour la barre du recapitulatif chiffre. */
  readonly outcomeMax = computed(() => Math.max(1, ...this.outcomeGroups().map((g) => g.count)));

  /** La valeur qui se detache — et seulement si elle se detache vraiment. Sept avis
   * differents donnent sept piles a egalite : les mettre toutes en accent revient a
   * annoncer sept majorites, c'est-a-dire aucune. */
  readonly outcomeWinner = computed(() => {
    const tetes = this.outcomeGroups().filter((g) => g.count === this.outcomeMax());
    return tetes.length === 1 ? tetes[0].value : null;
  });

  readonly decidedCard = computed(() => this.cardByValue(this.socket.result() ?? ''));


  readonly resultLayout = this.socket.resultLayout;


  readonly resultName = computed(() => {
    const v = this.socket.result();
    return v ? this.cardName(this.cardByValue(v)) || v : '';
  });



  readonly cardValues = computed(() => this.socket.deckSnapshot()?.cards.map((c) => c.value) ?? []);

  // --- Imposed avatar (free): deterministic initials + colour. Custom upload = Phase 2 (paid).
  private readonly AVATAR_COLORS = [
    '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#14b8a6', '#6366f1',
  ];

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

  initials(name: string): string {
    const parts = (name || '?').trim().split(/\s+/);
    const a = parts[0]?.[0] ?? '?';
    const b = parts.length > 1 ? parts[1][0] : parts[0]?.[1] ?? '';
    return (a + b).toUpperCase();
  }

  avatarColor(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return this.AVATAR_COLORS[h % this.AVATAR_COLORS.length];
  }

  transfer(participantId: string): void {
    this.socket.transferFacilitator(participantId);
  }
}
