import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { TabsModule } from 'primeng/tabs';

import { LanguageService } from '../../core/i18n/language.service';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { getAboutUiText } from './about.i18n';
import { CONTACT_INFO, emailDisplay, openContactEmail, phoneDisplay } from './contact';

/**
 * About page — a single page with three tabs (Company / Legal / Technical),
 * mirroring the QuizOnline About layout. Content is localized via about.i18n and
 * the shared contact identity; styles use the app theme tokens (light + dark).
 */
@Component({
  selector: 'app-about',
  standalone: true,
  imports: [TranslocoModule, TabsModule, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page page--narrow about-page">
      <app-page-header [icon]="'pi-info-circle'" [title]="'about.title' | transloco" />

      <p-tabs [(value)]="activeTab" class="about-tabs">
        <p-tablist>
          <p-tab value="company"><span class="pi pi-building tab-icon"></span><span>{{ ui().tabs.company }}</span></p-tab>
          <p-tab value="legal"><span class="pi pi-shield tab-icon"></span><span>{{ ui().tabs.legal }}</span></p-tab>
          <p-tab value="technical"><span class="pi pi-code tab-icon"></span><span>{{ ui().tabs.technical }}</span></p-tab>
        </p-tablist>

        <p-tabpanels>
          <!-- Company -->
          <p-tabpanel value="company">
            <article class="tab-content">
              <h2>{{ ui().companyTitle }}</h2>
              <p class="tab-intro">{{ ui().companyIntro }}</p>
              <dl class="company-list">
                <dt>{{ ui().company.companyLabel }}</dt>
                <dd>{{ contact.company }}</dd>
                <dt>{{ ui().company.vatLabel }}</dt>
                <dd class="mono">{{ contact.vat }}</dd>
                <dt>{{ ui().company.addressLabel }}</dt>
                <dd>
                  @for (line of contact.addressLines; track line; let last = $last) {
                    <span>{{ line }}</span>@if (!last) {<br />}
                  }
                </dd>
                <dt>{{ ui().company.emailLabel }}</dt>
                <dd class="contact-row">
                  <span class="mono">{{ emailShown }}</span>
                  <button (click)="emailClick()" class="contact-btn" type="button">
                    <i class="pi pi-envelope"></i><span>{{ ui().company.emailButton }}</span>
                  </button>
                </dd>
                <dt>{{ ui().company.phoneLabel }}</dt>
                <dd class="mono">{{ phoneShown }}</dd>
                <dt>{{ ui().company.websiteLabel }}</dt>
                <dd>
                  <a [href]="contact.websiteUrl" class="mono mono-link" rel="noreferrer noopener" target="_blank">{{ contact.websiteLabel }}</a>
                </dd>
              </dl>
            </article>
          </p-tabpanel>

          <!-- Legal -->
          <p-tabpanel value="legal">
            <article class="tab-content">
              <h2>{{ ui().legalTitle }}</h2>
              <p class="tab-intro">{{ ui().legalIntro }}</p>
              <div class="legal-sections">
                @for (section of ui().legalSections; track section.title) {
                  <div class="legal-block">
                    <h3>{{ section.title }}</h3>
                    <ul>
                      @for (line of section.content; track line) {
                        <li>{{ line }}</li>
                      }
                    </ul>
                  </div>
                }
              </div>
            </article>
          </p-tabpanel>

          <!-- Technical -->
          <p-tabpanel value="technical">
            <article class="tab-content">
              <h2>{{ ui().technicalTitle }}</h2>
              <p class="tab-intro">{{ ui().technicalIntro }}</p>
              <div class="tech-grid">
                @for (key of technicalCardKeys; track key) {
                  <div class="tech-card">
                    <h3>{{ ui().cards[key].title }}</h3>
                    <p>{{ ui().cards[key].description }}</p>
                    @if (key === 'repository') {
                      <div class="meta-block">
                        <span class="meta-label">{{ ui().repositoryUrlLabel }}</span>
                        <a class="mono mono-link" [href]="repositoryUrl" rel="noreferrer" target="_blank">{{ repositoryUrl }}</a>
                      </div>
                    }
                    <ul>
                      @for (item of ui().cards[key].items; track item) {
                        <li>{{ item }}</li>
                      }
                    </ul>
                  </div>
                }
              </div>
            </article>
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>
    </section>
  `,
  styles: [
    `
      .about-page {
        display: grid;
        gap: var(--s-4);
      }
      :host ::ng-deep .about-tabs .p-tabpanel,
      :host ::ng-deep .about-tabs .p-tabpanels {
        background: transparent;
        border: 0;
        box-shadow: none;
        padding: 0;
      }
      .tab-icon {
        margin-right: 0.35rem;
        font-size: 0.95rem;
      }
      .tab-content {
        padding: var(--s-4) 0 0;
      }
      .tab-content h2 {
        margin: 0 0 0.75rem;
        font-size: 1.3rem;
        color: var(--ink);
      }
      .tab-content h3 {
        margin: 0 0 0.5rem;
        font-size: 1.05rem;
        color: var(--ink);
      }
      .tab-intro {
        margin: 0 0 1.25rem;
        color: var(--muted);
        line-height: 1.65;
      }
      .company-list {
        display: grid;
        gap: 0.85rem 1.25rem;
        grid-template-columns: minmax(8rem, max-content) 1fr;
        margin: 0;
      }
      .company-list dt {
        color: var(--muted);
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        margin: 0;
        text-transform: uppercase;
        align-self: start;
        padding-top: 0.15rem;
      }
      .company-list dd {
        color: var(--ink);
        margin: 0;
        line-height: 1.55;
      }
      .contact-row {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }
      .contact-btn {
        align-items: center;
        background: var(--accent);
        border: 0;
        border-radius: 999px;
        color: #05261c;
        cursor: pointer;
        display: inline-flex;
        font: inherit;
        font-size: 0.88rem;
        font-weight: 600;
        gap: 0.45rem;
        padding: 0.5rem 0.9rem;
      }
      .contact-btn:hover {
        filter: brightness(1.08);
      }
      .legal-sections {
        display: grid;
        gap: 1.25rem;
      }
      .legal-block {
        padding: 1rem 1.25rem;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface);
      }
      .legal-block h3 {
        color: var(--ink);
      }
      .legal-block ul {
        margin: 0;
        padding-left: 1.2rem;
        color: var(--ink);
      }
      .legal-block li + li {
        margin-top: 0.4rem;
      }
      .tech-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
      }
      .tech-card {
        padding: 1.25rem;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--surface);
        display: grid;
        gap: 0.6rem;
        align-content: start;
      }
      .tech-card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }
      .tech-card ul {
        margin: 0;
        padding-left: 1.2rem;
        color: var(--ink);
      }
      .tech-card li + li {
        margin-top: 0.35rem;
      }
      .meta-block {
        display: grid;
        gap: 0.25rem;
      }
      .meta-label {
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--accent);
      }
      .mono {
        font-family: 'Consolas', 'Courier New', monospace;
        word-break: break-all;
        color: var(--ink);
      }
      .mono-link {
        text-decoration: none;
        color: var(--accent);
      }
      .mono-link:hover {
        text-decoration: underline;
      }
      @media (max-width: 1024px) {
        .tech-grid {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 640px) {
        .company-list {
          grid-template-columns: 1fr;
          gap: 0.4rem 0;
        }
        .company-list dd {
          margin-bottom: 0.6rem;
        }
      }
    `,
  ],
})
export class AboutComponent {
  private language = inject(LanguageService);
  protected readonly repositoryUrl = 'https://github.com/Foxugly';
  protected readonly technicalCardKeys = ['repository', 'backend', 'frontend'] as const;
  protected readonly activeTab = signal('company');
  protected readonly contact = CONTACT_INFO;
  protected readonly emailShown = emailDisplay();
  protected readonly phoneShown = phoneDisplay();
  protected readonly ui = computed(() => getAboutUiText(this.language.active()));

  protected emailClick(): void {
    openContactEmail('[Poker]');
  }
}
