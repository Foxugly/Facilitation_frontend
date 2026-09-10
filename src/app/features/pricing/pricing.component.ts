import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { MessageModule } from 'primeng/message';

import { BillingService, SubscriptionStatus } from '../../core/billing/billing.service';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

/** Public pricing page: free anonymous rooms vs the two paid team plans (1 / 5 teams,
 * monthly or yearly). States the 20-people-per-room and 20-members-per-team caps. */
@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [RouterLink, TranslocoModule, MessageModule, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page pricing-page">
      <app-page-header [icon]="'pi-tag'" [title]="'pricing.title' | transloco" />
      <p class="lead">{{ 'pricing.intro' | transloco }}</p>

      <!-- An offered account keeps its "you already have free access" banner, but the
           tiers stay visible so it can still consult the plans. -->
      @if (sub()?.bypass) {
        <p-message severity="success" [text]="'billing.offered_access_hint' | transloco" />
      }
      <div class="tiers">
          <!-- Free -->
          <article class="tier">
            <h3>{{ 'pricing.free_title' | transloco }}</h3>
            <div class="price">0 €</div>
            <ul>
              <li><i class="pi pi-check"></i>{{ 'pricing.free_f1' | transloco }}</li>
              <li><i class="pi pi-check"></i>{{ 'pricing.free_f2' | transloco }}</li>
              <li><i class="pi pi-check"></i>{{ 'pricing.free_f3' | transloco }}</li>
            </ul>
            <a class="tier-cta ghost" routerLink="/">{{ 'pricing.cta_free' | transloco }}</a>
          </article>

          <!-- 1 team -->
          <article class="tier featured">
            <h3>{{ 'pricing.team1_title' | transloco }}</h3>
            <div class="price">5 €<span class="excl-vat">{{ 'pricing.excl_vat' | transloco }}</span><span>{{ 'pricing.per_month' | transloco }}</span></div>
            <div class="price-alt">{{ 'pricing.or' | transloco }} 50 € {{ 'pricing.excl_vat' | transloco }}{{ 'pricing.per_year' | transloco }} <span class="save">{{ 'pricing.save' | transloco }}</span></div>
            <ul>
              <li><i class="pi pi-check"></i>{{ 'pricing.paid_f1' | transloco }}</li>
              <li><i class="pi pi-check"></i>{{ 'pricing.paid_f2' | transloco }}</li>
              <li><i class="pi pi-check"></i>{{ 'pricing.paid_f3' | transloco }}</li>
              <li><i class="pi pi-check"></i>{{ 'pricing.paid_f4' | transloco }}</li>
            </ul>
            <a class="tier-cta" routerLink="/teams">{{ 'pricing.cta_paid' | transloco }}</a>
          </article>

          <!-- 5 teams -->
          <article class="tier">
            <h3>{{ 'pricing.team5_title' | transloco }}</h3>
            <div class="price">20 €<span class="excl-vat">{{ 'pricing.excl_vat' | transloco }}</span><span>{{ 'pricing.per_month' | transloco }}</span></div>
            <div class="price-alt">{{ 'pricing.or' | transloco }} 200 € {{ 'pricing.excl_vat' | transloco }}{{ 'pricing.per_year' | transloco }} <span class="save">{{ 'pricing.save' | transloco }}</span></div>
            <ul>
              <li><i class="pi pi-check"></i>{{ 'pricing.team5_f1' | transloco }}</li>
              <li><i class="pi pi-check"></i>{{ 'pricing.paid_f1' | transloco }}</li>
              <li><i class="pi pi-check"></i>{{ 'pricing.paid_f2' | transloco }}</li>
              <li><i class="pi pi-check"></i>{{ 'pricing.paid_f3' | transloco }}</li>
            </ul>
            <a class="tier-cta" routerLink="/teams">{{ 'pricing.cta_paid' | transloco }}</a>
          </article>
      </div>

      <p class="vat-note">{{ 'pricing.vat_note' | transloco }}</p>
      <p class="cap-note"><i class="pi pi-info-circle"></i>{{ 'pricing.note' | transloco }}</p>
    </section>
  `,
  styles: [
    `
      .pricing-page {
        display: flex;
        flex-direction: column;
        gap: var(--s-6);
        padding-top: 40px;
        padding-bottom: 40px;
      }
      .lead {
        margin: 0;
        color: var(--muted);
        font-size: 1.05rem;
      }
      .tiers {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--s-6);
        align-items: stretch;
        width: 100%;
        max-width: 100%;
      }
      .tier {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        box-shadow: var(--shadow-card);
        padding: var(--s-6);
        display: flex;
        flex-direction: column;
        gap: var(--s-4);
      }
      .tier-cta {
        margin-top: auto;
      }
      .tier.featured {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent), var(--shadow-card);
      }
      .tier h3 {
        margin: 0;
        color: var(--ink);
      }
      .price {
        font-size: 2rem;
        font-weight: 800;
        color: var(--ink);
      }
      .price span {
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--muted);
      }
      .price-alt {
        margin-top: -8px;
        font-size: 0.85rem;
        color: var(--muted);
      }
      .excl-vat {
        font-size: 0.6em;
        font-weight: 400;
        color: var(--muted);
        margin-left: 0.25rem;
      }
      .vat-note {
        margin-top: 1.25rem;
        font-size: 0.9rem;
        color: var(--muted);
        text-align: center;
      }
      .save {
        display: inline-block;
        font-size: 0.72rem;
        font-weight: 700;
        color: var(--accent);
        background: color-mix(in srgb, var(--accent) 14%, transparent);
        padding: 1px 7px;
        border-radius: 999px;
        margin-left: 4px;
      }
      .tier ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      .tier li {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        color: var(--ink);
        line-height: 1.45;
      }
      .tier li i {
        color: var(--accent);
        font-size: 0.8rem;
        margin-top: 4px;
      }
      .tier-cta {
        text-align: center;
        text-decoration: none;
        font-weight: 700;
        padding: 0.65rem 1rem;
        border-radius: 999px;
        background: var(--accent);
        color: #05261c;
      }
      .tier-cta.ghost {
        background: transparent;
        color: var(--accent);
        border: 1px solid var(--accent);
      }
      .tier-cta:hover {
        filter: brightness(1.08);
      }
      .cap-note {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--muted);
        font-size: 0.9rem;
      }
      .cap-note i {
        color: var(--accent);
      }
      @media (max-width: 768px) {
        .tiers {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class PricingComponent implements OnInit {
  private readonly billing = inject(BillingService);
  protected readonly sub = signal<SubscriptionStatus | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.sub.set(await this.billing.status());
    } catch {
      // Anonymous visitors (or any lookup failure): keep sub null, pricing grid stays visible.
    }
  }
}
