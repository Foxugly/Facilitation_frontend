import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { FALLBACK_LANG } from '../../../core/i18n/available-languages';
import { DeckSnapshot } from '../../../core/realtime/protocol';
import { DelegationCardComponent } from '../delegation-card/delegation-card.component';

/**
 * Lays out the deck's cards (7 across on desktop, wrapping on mobile). Reads the
 * immutable snapshot, emits (vote) with the chosen card value.
 */
@Component({
  selector: 'app-delegation-deck',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DelegationCardComponent],
  template: `
    <div class="deck">
      @for (card of deck().cards; track card.value) {
        <app-delegation-card
          [card]="card"
          [lang]="lang()"
          [revealed]="true"
          [selected]="card.value === myVote()"
          [disabled]="!votable()"
          [cardBack]="deck().cardBack.image"
          (click)="votable() && vote.emit(card.value)"
        />
      }
    </div>
  `,
  styles: [
    `
      /* Une carte de la main fait EXACTEMENT la taille d'une carte sur la table :
         les deux lisent la meme --card, calculee par la salle (room.component.scss).
         Elles etaient auparavant figees a 60px, sans rapport ni avec l'ecran ni avec
         la table, et les libelles y etaient illisibles. */
      .deck {
        display: grid;
        /* --card et --gap viennent de la salle : la meme taille y sert aux cartes
           de la table. auto-fit replie la main sur plusieurs rangees si la largeur
           ne suffit pas, plutot que de reduire les cartes en dessous du plancher. */
        grid-template-columns: repeat(auto-fit, var(--card-hand, 60px));
        justify-content: center;
        gap: var(--gap, 12px);
      }
    `,
  ],
})
export class DelegationDeckComponent {
  readonly deck = input.required<DeckSnapshot>();
  readonly myVote = input<string | null>(null);
  readonly votable = input(false);
  readonly lang = input(FALLBACK_LANG as string);
  readonly vote = output<string>();
}
