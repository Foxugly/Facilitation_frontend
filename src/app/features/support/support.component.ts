import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

/** Support / donate page, inspired by the QuizOnline donate page — voluntary support
 * via GitHub Sponsors (separate from the paid team subscription). */
@Component({
  selector: 'app-support',
  standalone: true,
  imports: [TranslocoModule, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page page--narrow support-page">
      <app-page-header [icon]="'pi-heart'" [title]="'support.title' | transloco" />

      <h2 class="why">{{ 'support.why_title' | transloco }}</h2>
      <div class="reasons">
        @for (r of reasons; track r.key) {
          <article class="reason">
            <i [class]="r.icon"></i>
            <h3>{{ 'support.reasons.' + r.key + '.title' | transloco }}</h3>
            <p>{{ 'support.reasons.' + r.key + '.desc' | transloco }}</p>
          </article>
        }
      </div>

      <div class="cta-card">
        <h2>{{ 'support.cta_title' | transloco }}</h2>
        <p>{{ 'support.cta_desc' | transloco }}</p>
        <a class="cta-button" [href]="sponsorUrl" rel="noreferrer" target="_blank">
          <i class="pi pi-heart"></i>{{ 'support.cta_button' | transloco }}
        </a>
        <p class="cta-note">{{ 'support.cta_note' | transloco }}</p>
      </div>

      <div class="thanks">
        <h2>{{ 'support.thanks_title' | transloco }}</h2>
        <p>{{ 'support.thanks_desc' | transloco }}</p>
      </div>
    </section>
  `,
  styles: [
    `
      .support-page {
        display: flex;
        flex-direction: column;
        gap: var(--s-6);
      }
      .why {
        margin: 0;
        color: var(--ink);
      }
      .reasons {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--s-4);
      }
      .reason {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        padding: var(--s-4);
        display: grid;
        gap: 6px;
        align-content: start;
      }
      .reason i {
        font-size: 1.4rem;
        color: var(--accent);
      }
      .reason h3 {
        margin: 4px 0 0;
        font-size: 1.05rem;
        color: var(--ink);
      }
      .reason p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }
      .cta-card {
        text-align: center;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: color-mix(in srgb, var(--accent) 8%, var(--surface));
        box-shadow: var(--shadow-card);
        padding: var(--s-6) var(--s-4);
        display: grid;
        gap: var(--s-3);
        justify-items: center;
      }
      .cta-card h2 {
        margin: 0;
        color: var(--ink);
      }
      .cta-card p {
        margin: 0;
        color: var(--muted);
        max-width: 42rem;
      }
      .cta-button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--accent);
        color: #05261c;
        font-weight: 700;
        text-decoration: none;
        padding: 0.8rem 1.4rem;
        border-radius: 999px;
      }
      .cta-button:hover {
        filter: brightness(1.08);
      }
      .cta-note {
        font-size: 0.85rem;
      }
      .thanks {
        text-align: center;
      }
      .thanks h2 {
        margin: 0 0 var(--s-2);
        color: var(--ink);
      }
      .thanks p {
        margin: 0;
        color: var(--muted);
      }
      @media (max-width: 640px) {
        .reasons {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class SupportComponent {
  protected readonly sponsorUrl = 'https://github.com/sponsors/Foxugly';
  protected readonly reasons = [
    { icon: 'pi pi-bolt', key: 'free' },
    { icon: 'pi pi-server', key: 'infra' },
    { icon: 'pi pi-wrench', key: 'maintenance' },
    { icon: 'pi pi-sparkles', key: 'features' },
  ];
}
