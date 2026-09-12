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
        // Defense en profondeur (round de correction 1, point 4) : le secret
        // tient DEJA par construction cote serveur (aucun round anonyme n'y
        // ecrit jamais `votes`), mais ce composant ne doit pas non plus
        // DEPENDRE de cette seule garantie amont pour rester correct -- un
        // bloc anonyme qui porterait `votes` par erreur ne doit toujours rien
        // afficher ici.
        voters: r.anonymous
          ? ''
          : (r.votes ?? []).map((v) => `${noms.get(v.participantId) ?? '?'} (${v.points ?? 0})`).join(', '),
      }))
      .sort((a, b) => a.rank - b.rank);
  });

  readonly outcomeVisible = computed(() => this.state() === 'revealed' || this.state() === 'acted');

  /** Mes jetons deja poses sur CET item (0 si aucune reponse encore). */
  pointsFor(item: RoundItem): number {
    return this.socket.myResponses()[String(item.id)]?.points ?? 0;
  }

  /** Etat d'affichage des totaux pour CET item, pendant le vote (round de
   * correction 1, point 2) -- TROIS etats, jamais deux : `hidden` (on SAIT
   * que le facilitateur les masque), `visible` (on SAIT qu'ils sont
   * montres), et `unknown`, qui ne doit RIEN affirmer -- ni "0 pts" (une
   * valeur qui pourrait etre fausse), ni "masque" (qui pourrait l'etre tout
   * autant). Avant ce correctif, l'absence de donnee etait UNIQUEMENT lue
   * comme "masque" : un participant deja connecte avant l'ouverture du vote,
   * avant tout premier jeton, affichait donc "Totaux masques" pendant qu'un
   * autre qui rechargeait au meme instant lisait "0 pts" -- deux ecrans
   * contradictoires dans la meme salle pour le meme etat reel.
   *
   * `visibility` vient de `roundConfig` (§8.3), pas de la presence d'un total
   * en direct : les deux questions sont INDEPENDANTES (le reglage peut etre
   * connu sans qu'aucun jeton n'ait encore ete pose). Quand `visibility` vaut
   * `true` et qu'aucune entree n'existe encore dans `liveTotals()`, 0 est une
   * valeur REELLE, pas une supposition : la toute premiere reponse posee sur
   * CE round declenche deja une diffusion (contrat §8.7), donc l'absence
   * d'entree ne peut signifier qu'"personne n'a encore rien pose". */
  totalsDisplay(
    item: RoundItem,
  ): { kind: 'hidden' } | { kind: 'unknown' } | { kind: 'visible'; totalPoints: number; responseCount: number } {
    const visibility = this.socket.roundConfig()['liveTotals'];
    if (visibility === false) return { kind: 'hidden' };
    if (visibility !== true) return { kind: 'unknown' };
    const total = this.liveTotalsByItem().get(item.id);
    return { kind: 'visible', totalPoints: total?.totalPoints ?? 0, responseCount: total?.responseCount ?? 0 };
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
