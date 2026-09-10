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

function arcEvenAngles(n: number, rx: number, ry: number): number[] {
  if (n <= 0) return [];
  const STEPS = 1440;
  const start = -Math.PI / 2;
  const cum: number[] = [0];
  let prevX = rx * Math.cos(start);
  let prevY = ry * Math.sin(start);
  for (let s = 1; s <= STEPS; s++) {
    const t = start + (s / STEPS) * 2 * Math.PI;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    cum.push(cum[s - 1] + Math.hypot(x - prevX, y - prevY));
    prevX = x;
    prevY = y;
  }
  const total = cum[STEPS];
  const angles: number[] = [];
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total;
    let k = 1;
    while (k < cum.length && cum[k] < target) k++;
    const a = cum[k - 1];
    const b = cum[k] ?? a;
    const f = b > a ? (target - a) / (b - a) : 0;
    angles.push(start + ((k - 1 + f) / STEPS) * 2 * Math.PI);
  }
  return angles;
}

interface Seat {
  participantId: string;
  username: string;
  role: string;
  // Radial layout (same angle from the table centre): the card sits near the table,
  // the person (avatar + name) further out. All in % of the felt container.
  cardX: number;
  cardY: number;
  /** Direction ou poser l'etiquette du joueur, depuis SA carte. Normalisee de sorte
   * que la composante dominante vaille 1 : la CSS multiplie alors chaque composante
   * par l'ecart qu'il faut degager sur cet axe, en pixels (voir .seat-person). */
  personUx: number;
  personUy: number;
  card: SnapshotCard | null; // back placeholder, or the actual card once revealed nominatively
  show: boolean; // whether the seat has a card (voted) at all
  revealed: boolean; // face up — nominative reveal only
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


  // --- Round timer (contract §timer): the countdown is purely cosmetic, the
  // interval only runs while a deadline exists and stops on reveal/destroy.
  readonly remainingSeconds = signal<number | null>(null);

  /** Seats laid out around the table (ellipse), each carrying its card state:
   * empty (not voted) → back (voted, hidden) → face up, but ONLY once the round is
   * revealed in nominative mode. In anonymous mode the seat stays face-down forever:
   * the server sends no participant -> card link, so there is nothing to flip, and
   * the per-value decompte (`socket.voteTally`) is what surfaces the values. */
  readonly seats = computed<Seat[]>(() => {
    const participants = this.socket.participants();
    const deck = this.socket.deckSnapshot();
    const votedIds = new Set(this.socket.participation().votedIds);
    const nominative = !this.socket.revealMode().anonymous;
    const revealedRound = this.state() === 'revealed' || this.state() === 'acted';
    const voteByParticipant = new Map(
      this.socket.nominativeVotes().map((v) => [v.participantId, v.cardValue]),
    );
    const n = participants.length;
    // Positions are in % of a wide box, so equal % radii give unequal pixel gaps
    // (side seats end up far, top/bottom seats close). Derive the card radii from
    // a single target gap in % of table HEIGHT, dividing the horizontal one by the
    // table's aspect — so the avatar→card gap is uniform whatever the angle.
    // NB: keep this aspect formula in sync with feltAspect() — the geometry here
    // must match the shape the felt is actually drawn at. An elongated table (cap
    // 2.6) leaves less vertical room, so the card size is tuned down a touch to keep
    // a clear gap between neighbouring cards for 3–15 seats (verified: card→card
    // clearance ≥ 4px across that range, with the larger felt below).
    const aspect = Math.min(2.6, 1.9 + n * 0.05);
    const personR = 49;
    const gap = 24;
    const cardRx = personR - gap / aspect;
    const cardRy = personR - gap;
    // Even angle steps bunch seats on the wide sides (where the ellipse turns
    // fast), so cards there overlap. Space them by equal ARC LENGTH instead — a
    // uniform visual gap between neighbours. Angles are measured on the avatar
    // ellipse (x-radius scaled by the aspect to work in a square metric).
    const seatAngles = arcEvenAngles(n, personR * aspect, personR);
    return participants.map((p, i) => {
      const angle = seatAngles[i];
      const hasVoted = p.hasVoted || votedIds.has(p.participantId);
      const ownVote = voteByParticipant.get(p.participantId);
      const faceUp = revealedRound && nominative && ownVote !== undefined;
      const card = faceUp
        ? this.cardByValue(ownVote!)
        : hasVoted && deck
          ? deck.cards[0] // back placeholder only
          : null;
      const cx = Math.cos(angle);
      const sy = Math.sin(angle);
      // Deux rectangles ne se recouvrent pas des lors qu'ils sont separes sur UN axe.
      // En divisant par la composante dominante, celle-ci vaut 1 : l'axe le plus
      // franc atteint donc exactement l'ecart requis, que la CSS convertit en pixels
      // depuis la taille reelle des cartes. Un ecart radial unique ne pouvait pas y
      // suffire — il faut 62px pour degager une carte en largeur, 87 en hauteur, et
      // en diagonale un meme ecart ne couvrait ni l'un ni l'autre.
      const dominante = Math.max(Math.abs(cx), Math.abs(sy)) || 1;
      return {
        participantId: p.participantId,
        username: p.username,
        role: p.role,
        // Card a uniform pixel gap inside the avatar, along the same radial.
        cardX: 50 + cardRx * cx,
        cardY: 50 + cardRy * sy,
        personUx: cx / dominante,
        personUy: sy / dominante,
        card,
        show: hasVoted,
        revealed: faceUp,
      };
    });
  });


  // Must match the `aspect` in seats() so the seat geometry lands on the real felt shape.
  readonly feltAspect = computed(() => Math.min(2.6, 1.9 + this.socket.participants().length * 0.05).toFixed(2));


  /** Part de la largeur du tapis qu'une carte de siege peut occuper sans qu'aucune
   * ne chevauche sa voisine, pour le nombre de participants du moment.
   *
   * C'est une FRACTION et non des pixels : la geometrie des sieges est definie en
   * pourcentages du tapis, donc la garantie vaut a n'importe quelle taille de table —
   * ce qui ne serait pas vrai avec des pixels, les cartes se percutant sur un petit
   * ecran.
   *
   * Elle est CALCULEE depuis la geometrie reelle des sieges, non tiree d'une table de
   * valeurs : deux cartes ne se recouvrent pas des lors que leur ecart horizontal
   * atteint une largeur de carte, OU leur ecart vertical une hauteur. La part maximale
   * est donc le minimum, sur toutes les paires, du meilleur des deux ecarts. Le facteur
   * de securite reproduit le jeu de 4px de la calibration d'origine.
   *
   * L'ancienne version lisait une taille calibree pour le PIRE cas et l'appliquait
   * partout : a 5 sieges les cartes etaient deux fois plus petites que ce que la
   * table permettait. Verifie par dichotomie dans un vrai navigateur : 16,07 %
   * calcule contre 15,48 % mesure a 5 sieges, 12,67 contre 12,30 a 8, 9,45 contre
   * 9,13 a 12, 3,49 contre 3,20 a 21 — cette derniere mesure datant d'avant le
   * plafond de 15 participants, qui vaut desormais pour une salle.
   */
  readonly seatCardFraction = computed(() => {
    const n = this.socket.participants().length;
    if (n < 2) return 0.18;
    const aspect = Math.min(2.6, 1.9 + n * 0.05);
    const personR = 49;
    const gap = 24;
    const rx = personR - gap / aspect;
    const ry = personR - gap;
    const points = arcEvenAngles(n, personR * aspect, personR).map((a) => ({
      x: 50 + rx * Math.cos(a),
      y: 50 + ry * Math.sin(a),
    }));
    let part = Infinity;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = Math.abs(points[i].x - points[j].x) / 100;
        // L'ecart vertical est en % de la HAUTEUR du tapis : le ramener en largeur
        // (division par le ratio), puis en largeur de carte (division par 7/5).
        const dy = Math.abs(points[i].y - points[j].y) / (100 * aspect * 1.4);
        part = Math.min(part, Math.max(dx, dy));
      }
    }
    return +Math.min(0.18, part * 0.92).toFixed(4);
  });


  /** Nombre de cartes du deck actif : la rangee de la main s'y ajuste. */
  readonly deckCardCount = computed(() => this.socket.deckSnapshot()?.cards.length ?? 7);


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
    const votants = this.socket.nominativeVotes();
    return this.socket
      .voteTally()
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
