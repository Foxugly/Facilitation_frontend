import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The single shared in-page header (fleet standard) : 3-column grid
 * (1fr · auto · 1fr). Left slot = Back button / breadcrumbs ([slot=left]),
 * centre = emerald icon + centered <h1> (+ [slot=title-after] for a chip),
 * right slot = page actions ([slot=right]). No separate detail-header.
 * Collapses to a single column under 640px.
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header">
      <div class="page-header__side page-header__side--left">
        <ng-content select="[slot=left]"></ng-content>
      </div>
      <div class="page-header__center">
        <i class="pi {{ icon() }}" aria-hidden="true"></i>
        <h1>{{ title() }}</h1>
        <ng-content select="[slot=title-after]"></ng-content>
      </div>
      <div class="page-header__side page-header__side--right">
        <ng-content select="[slot=right]"></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      .page-header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: var(--s-3);
        margin-bottom: 1.25rem;
      }
      .page-header__center {
        display: inline-flex;
        align-items: center;
        gap: var(--s-2);
        justify-self: center;
      }
      .page-header__center i {
        color: var(--accent);
        font-size: 1.25rem;
      }
      .page-header__center h1 {
        margin: 0;
        font-size: 1.4rem;
        color: var(--ink);
        text-align: center;
      }
      .page-header__side {
        display: flex;
        align-items: center;
        gap: var(--s-2);
        flex-wrap: wrap;
      }
      .page-header__side--right {
        justify-content: flex-end;
      }
      @media (max-width: 640px) {
        .page-header {
          grid-template-columns: 1fr;
        }
        .page-header__center {
          justify-self: start;
        }
        .page-header__center h1 {
          text-align: left;
        }
        .page-header__side--right {
          justify-content: flex-start;
        }
      }
    `,
  ],
})
export class PageHeaderComponent {
  readonly icon = input('pi-th-large');
  readonly title = input('');
}
