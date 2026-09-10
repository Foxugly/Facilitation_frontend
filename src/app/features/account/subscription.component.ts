import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import {
  BillingHistory,
  BillingInvoice,
  BillingService,
  BillingSubscriptionEntry,
  SubscriptionStatus,
} from '../../core/billing/billing.service';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

/** Stripe statuses that read as "this subscription is live". */
const LIVE_STATUSES = new Set(['active', 'trialing']);

/**
 * The account's subscription: what is running now, then everything that came
 * before with its invoices. History and invoices are read live from Stripe — we
 * store none of it, so this page is always in sync with what was actually billed.
 */
@Component({
  selector: 'app-subscription',
  standalone: true,
  imports: [DatePipe, TranslocoModule, ButtonModule, TagModule, PageHeaderComponent],
  styleUrl: './account.scss',
  template: `
    <section class="page page--narrow">
      <app-page-header [icon]="'pi-credit-card'" [title]="'subscription.title' | transloco" />

      @if (loading()) {
        <p class="meta-hint">{{ 'subscription.loading' | transloco }}</p>
      } @else if (status(); as st) {
        @if (!st.billingEnabled) {
          <div class="section">
            <p class="meta-hint">{{ 'subscription.billing_off' | transloco }}</p>
          </div>
        } @else {
          <!-- Current -->
          <div class="section">
            <h3>{{ 'subscription.current' | transloco }}</h3>
            @if (st.bypass) {
              <p-tag severity="info" [value]="'subscription.offered' | transloco" />
              <p class="meta-hint">{{ 'subscription.offered_hint' | transloco }}</p>
            } @else if (st.isPaid) {
              <dl class="kv">
                <dt>{{ 'subscription.plan' | transloco }}</dt>
                <dd>
                  {{ 'pricing.' + st.plan + '_title' | transloco }} ·
                  {{ 'subscription.interval_' + st.interval | transloco }}
                  <p-tag [severity]="'success'" [value]="'subscription.status_' + st.status | transloco" />
                </dd>
                <dt>{{ 'subscription.quota' | transloco }}</dt>
                <dd>{{ st.teamsUsed }} / {{ st.quota }}</dd>
              </dl>
              @if (st.canManage) {
                <p-button [label]="'billing.manage' | transloco" icon="pi pi-external-link"
                          [outlined]="true" severity="secondary" (onClick)="manage()" />
              }
            } @else {
              <p class="meta-hint">{{ 'subscription.none' | transloco }}</p>
              <p-button [label]="'subscription.see_plans' | transloco" icon="pi pi-tag"
                        severity="success" (onClick)="goToPlans()" />
            }
          </div>

          <!-- History -->
          <div class="section">
            <h3>{{ 'subscription.history' | transloco }}</h3>
            @if (history()?.subscriptions?.length) {
              <div class="table-scroll">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>{{ 'subscription.plan' | transloco }}</th>
                      <th>{{ 'subscription.status' | transloco }}</th>
                      <th>{{ 'subscription.started' | transloco }}</th>
                      <th>{{ 'subscription.ended' | transloco }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of history()!.subscriptions; track s.id) {
                      <tr>
                        <td>
                          {{ s.plan ? ('pricing.' + s.plan + '_title' | transloco) : '—' }}
                          @if (s.interval) { · {{ 'subscription.interval_' + s.interval | transloco }} }
                        </td>
                        <td>
                          <p-tag [severity]="isLive(s) ? 'success' : 'secondary'"
                                 [value]="'subscription.status_' + s.status | transloco" />
                        </td>
                        <td>{{ s.startedAt ? (s.startedAt | date: 'mediumDate') : '—' }}</td>
                        <td>{{ endDate(s) ? (endDate(s) | date: 'mediumDate') : '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="meta-hint">{{ 'subscription.no_history' | transloco }}</p>
            }
          </div>

          <!-- Invoices -->
          <div class="section">
            <h3>{{ 'subscription.invoices' | transloco }}</h3>
            @if (history()?.invoices?.length) {
              <div class="table-scroll">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>{{ 'subscription.invoice_number' | transloco }}</th>
                      <th>{{ 'subscription.date' | transloco }}</th>
                      <th>{{ 'subscription.amount' | transloco }}</th>
                      <th>{{ 'subscription.status' | transloco }}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (inv of history()!.invoices; track inv.id) {
                      <tr>
                        <td class="mono">{{ inv.number || inv.id }}</td>
                        <td>{{ inv.createdAt ? (inv.createdAt | date: 'mediumDate') : '—' }}</td>
                        <td>{{ money(inv) }}</td>
                        <td>
                          <p-tag [severity]="inv.status === 'paid' ? 'success' : 'secondary'"
                                 [value]="'subscription.invoice_' + inv.status | transloco" />
                        </td>
                        <td class="actions">
                          @if (inv.pdfUrl) {
                            <a class="link" [href]="inv.pdfUrl" target="_blank" rel="noreferrer noopener">
                              <i class="pi pi-file-pdf"></i> {{ 'subscription.pdf' | transloco }}
                            </a>
                          }
                          @if (inv.hostedUrl) {
                            <a class="link" [href]="inv.hostedUrl" target="_blank" rel="noreferrer noopener">
                              <i class="pi pi-external-link"></i> {{ 'subscription.view' | transloco }}
                            </a>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="meta-hint">{{ 'subscription.no_invoices' | transloco }}</p>
            }
          </div>
        }
      }
    </section>
  `,
})
export class SubscriptionComponent implements OnInit {
  private billing = inject(BillingService);
  private messages = inject(MessageService);
  private transloco = inject(TranslocoService);

  readonly status = signal<SubscriptionStatus | null>(null);
  readonly history = signal<BillingHistory | null>(null);
  readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    try {
      this.status.set(await this.billing.status());
      // History is best-effort: the page is still useful without it.
      this.history.set(await this.billing.history().catch(() => null));
    } finally {
      this.loading.set(false);
    }
  }

  isLive(s: BillingSubscriptionEntry): boolean {
    return LIVE_STATUSES.has(s.status);
  }

  /** A cancelled subscription ended when it was cancelled; a live one runs to the period end. */
  endDate(s: BillingSubscriptionEntry): string | null {
    return s.canceledAt ?? s.currentPeriodEnd;
  }

  money(inv: BillingInvoice): string {
    // Stripe amounts are in the currency's minor unit.
    return new Intl.NumberFormat(this.transloco.getActiveLang(), {
      style: 'currency',
      currency: inv.currency || 'EUR',
    }).format(inv.amountPaid / 100);
  }

  goToPlans(): void {
    window.location.href = '/pricing';
  }

  async manage(): Promise<void> {
    try {
      await this.billing.manage();
    } catch {
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    }
  }
}
