import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

/**
 * Privacy notice — a short, real privacy statement (not lorem) covering what
 * data Poker handles, why, retention/hosting, GDPR rights and contact. Public
 * page (no auth guard); it is the target of the footer's Privacy link. Content
 * is localized via the Transloco `privacy.*` keys in public/i18n/*.json.
 */
@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [TranslocoModule, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page page--narrow privacy-page">
      <app-page-header [icon]="'pi-shield'" [title]="'privacy.title' | transloco" />

      <p class="lead">{{ 'privacy.intro' | transloco }}</p>
      <p class="updated">{{ 'privacy.updated' | transloco }}</p>

      <div class="sections">
        @for (key of sectionKeys; track key) {
          <article class="section">
            <h2>{{ 'privacy.sections.' + key + '.title' | transloco }}</h2>
            <p>{{ 'privacy.sections.' + key + '.body' | transloco }}</p>
          </article>
        }
      </div>

      <div class="contact-card">
        <h2>{{ 'privacy.contact_title' | transloco }}</h2>
        <p>{{ 'privacy.contact_lead' | transloco }}</p>
        <a class="contact-link" [href]="'mailto:' + email">
          <i class="pi pi-envelope"></i>{{ email }}
        </a>
      </div>
    </section>
  `,
  styles: [
    `
      .privacy-page {
        display: flex;
        flex-direction: column;
        gap: var(--s-4);
      }
      .lead {
        margin: 0;
        color: var(--ink);
        line-height: 1.65;
      }
      .updated {
        margin: 0;
        color: var(--muted);
        font-size: 0.85rem;
      }
      .sections {
        display: flex;
        flex-direction: column;
        gap: var(--s-3);
      }
      .section {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        padding: var(--s-4);
        display: grid;
        gap: 6px;
      }
      .section h2 {
        margin: 0;
        font-size: 1.1rem;
        color: var(--ink);
      }
      .section p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .contact-card {
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
      .contact-card h2 {
        margin: 0;
        color: var(--ink);
      }
      .contact-card p {
        margin: 0;
        color: var(--muted);
        max-width: 42rem;
      }
      .contact-link {
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
      .contact-link:hover {
        filter: brightness(1.08);
      }
    `,
  ],
})
export class PrivacyComponent {
  protected readonly email = 'info@foxugly.com';
  protected readonly sectionKeys = ['data', 'usage', 'retention', 'rights'] as const;
}
