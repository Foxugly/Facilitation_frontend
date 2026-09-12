import { Component, computed, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { TagModule } from 'primeng/tag';

import { RoomSocketService } from '../../../../core/realtime/room-socket.service';
import { ItemResult, RoundItem, RoundState } from '../../../../core/realtime/protocol';

const BADGE_SEVERITY: Record<RoundState, 'secondary' | 'success' | 'warn' | 'info'> = {
  idle: 'secondary',
  open: 'success',
  revealed: 'warn',
  acted: 'info',
};

/** Une ligne de classement, une fois le round revele — `itemResults` fusionne
 * deja `rank`/`totalPoints`/`responseCount` (contrat §8.6) ; ce composant n'a
 * plus qu'a retrouver le TEXTE de l'item, absent du bloc de depouillement. */
interface RankedItem {
  itemId: number;
  text: string;
  rank: number;
  totalPoints: number;
  responseCount: number;
  anonymous: boolean;
  voters: string;
}

/**
 * Le plateau de l'activite Dot Voting : les items du round, les gommettes
 * posees par CE participant (sa main, item par item), les totaux quand le
 * facilitateur les rend visibles, le classement une fois revele.
 *
 * Meme decoupage que le poker (table.component.ts) : ce composant injecte
 * `RoomSocketService` directement, pas d'`input()`. Pas de carte a jouer ici
 * (design dot-voting §7, deck sans carte) : la "main" est une liste de
 * boutons +/- par item, pas un eventail — decision de conception, pour le
 * tactile (pas de glisser-depose).
 */
@Component({
  selector: 'app-dot-voting-table',
  standalone: true,
  imports: [TranslocoModule, TagModule],
  templateUrl: './table.component.html',
  styleUrl: './table.component.scss',
})
export class DotVotingTableComponent {
  readonly socket = inject(RoomSocketService);

  readonly state = this.socket.roundState;
  readonly badgeSeverity = computed(() => BADGE_SEVERITY[this.state()]);
  readonly items = this.socket.items;

  /** Un jeton ne se pose que pendant le vote — avant (`idle`) rien n'existe
   * encore a poser, apres (`revealed`/`acted`) le round est clos. */
  readonly votable = computed(() => this.state() === 'open');

  /** n = nombre d'items du round (design §1) — le budget total (2n) et le
   * plafond par item (n) s'en deduisent, ils ne se reglent jamais. */
  readonly itemCount = computed(() => this.items().length);
  readonly totalBudget = computed(() => 2 * this.itemCount());
  /** Ce que J'AI deja pose, tous items confondus — jamais secret pour
   * soi-meme (contrat §6.a), donc lu directement dans `myResponses`. */
  readonly usedBudget = computed(() =>
    this.items().reduce((sum, item) => sum + this.pointsFor(item), 0),
  );
  readonly remainingBudget = computed(() => this.totalBudget() - this.usedBudget());

  /** Totaux en direct (contrat §8.7) — vide tant que le facilitateur ne les a
   * pas rendus visibles (defaut : secret) ou que le round n'est pas ouvert. */
  private readonly liveTotalsByItem = computed(() => {
    const map = new Map<number, { totalPoints: number; responseCount: number }>();
    for (const t of this.socket.liveTotals()) map.set(t.itemId, t);
    return map;
  });

  /** Le classement, une fois revele (design §6) — `itemResults` porte deja
   * `rank` (1 = le plus de jetons), fige par le serveur a la revelation ; ce
   * composant se contente de trier et d'attacher le texte de l'item. */
  readonly ranking = computed<RankedItem[]>(() => {
    const byId = new Map(this.items().map((i) => [i.id, i.text]));
    const noms = new Map(this.socket.participants().map((p) => [p.participantId, p.username]));
    return this.socket
      .itemResults()
      .filter((r): r is ItemResult & { rank: number } => r.rank !== undefined)
      .map((r) => ({
        itemId: r.itemId,
        text: byId.get(r.itemId) ?? '',
        rank: r.rank,
        totalPoints: r.totalPoints ?? 0,
        responseCount: r.responseCount ?? 0,
        anonymous: r.anonymous,
        voters: (r.votes ?? [])
          .map((v) => `${noms.get(v.participantId) ?? '?'} (${v.points ?? 0})`)
          .join(', '),
      }))
      .sort((a, b) => a.rank - b.rank);
  });

  readonly outcomeVisible = computed(() => this.state() === 'revealed' || this.state() === 'acted');

  /** Mes jetons deja poses sur CET item (0 si aucune reponse encore). */
  pointsFor(item: RoundItem): number {
    return this.socket.myResponses()[String(item.id)]?.points ?? 0;
  }

  /** Le total en direct de cet item, si le facilitateur l'a rendu visible. */
  liveTotalFor(item: RoundItem): { totalPoints: number; responseCount: number } | null {
    return this.liveTotalsByItem().get(item.id) ?? null;
  }

  /** Aucun geste impossible ne doit etre propose : ni au-dela du budget total,
   * ni au-dela du plafond par item (design §1, "au plus n jetons"). */
  canIncrement(item: RoundItem): boolean {
    return this.votable() && this.remainingBudget() > 0 && this.pointsFor(item) < this.itemCount();
  }

  canDecrement(item: RoundItem): boolean {
    return this.votable() && this.pointsFor(item) > 0;
  }

  increment(item: RoundItem): void {
    if (!this.canIncrement(item)) return;
    this.socket.castResponse(item.id, { points: this.pointsFor(item) + 1 });
  }

  decrement(item: RoundItem): void {
    if (!this.canDecrement(item)) return;
    this.socket.castResponse(item.id, { points: this.pointsFor(item) - 1 });
  }
}
