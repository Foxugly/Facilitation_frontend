import { TestBed } from '@angular/core/testing';
import { provideTranslocoScope, TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { describe, expect, it } from 'vitest';

import fr from '../../../../public/i18n/fr.json';
import { BillingService } from '../../core/billing/billing.service';
import { SubscriptionComponent } from './subscription.component';

/**
 * The subscription page renders data we never store — it comes straight from
 * Stripe — so a browser can only show it with real billing data. These specs pin
 * the two shapes that matter instead: populated tables, and the degraded case
 * where Stripe gave us nothing.
 */
function setup(history: unknown, status: unknown) {
  TestBed.configureTestingModule({
    imports: [
      SubscriptionComponent,
      TranslocoTestingModule.forRoot({
        langs: { fr },
        translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
      }),
    ],
    providers: [
      MessageService,
      provideTranslocoScope({ scope: '' }),
      {
        provide: BillingService,
        useValue: {
          status: () => Promise.resolve(status),
          history: () => Promise.resolve(history),
        },
      },
    ],
  });
  return TestBed.createComponent(SubscriptionComponent);
}

/** ngOnInit awaits two promises; whenStable() alone doesn't drain that chain. */
async function render(fixture: ReturnType<typeof setup>) {
  fixture.detectChanges();
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  }
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

const PAID_STATUS = {
  billingEnabled: true, isPaid: true, bypass: false, status: 'active',
  plan: 'team5', interval: 'yearly', quota: 5, teamsUsed: 2, canManage: true,
};

const HISTORY = {
  billingEnabled: true,
  subscriptions: [
    {
      id: 'sub_1', status: 'canceled', plan: 'team1', interval: 'monthly',
      startedAt: '2026-01-15T10:00:00Z', currentPeriodEnd: '2026-02-15T10:00:00Z',
      canceledAt: '2026-02-15T10:00:00Z',
    },
  ],
  invoices: [
    {
      id: 'in_1', number: 'F-2026-001', status: 'paid', amountPaid: 20000,
      currency: 'EUR', createdAt: '2026-03-01T10:00:00Z',
      hostedUrl: 'https://stripe.test/i/1', pdfUrl: 'https://stripe.test/i/1.pdf',
    },
    {
      id: 'in_2', number: 'F-2026-002', status: 'open', amountPaid: 500,
      currency: 'EUR', createdAt: '2026-04-01T10:00:00Z',
      hostedUrl: 'https://stripe.test/i/2', pdfUrl: '',
    },
  ],
};

describe('SubscriptionComponent', () => {
  it('renders the past subscriptions and the invoices with their links', async () => {
    const fixture = setup(HISTORY, PAID_STATUS);
    const text = await render(fixture);
    expect(text).toContain('F-2026-001');
    expect(text).toContain('F-2026-002');

    // Amounts are Stripe minor units: 20000 cents must read as 200, not 20000.
    expect(text).toMatch(/200[.,]00/);
    expect(text).not.toMatch(/20[\s ]?000[.,]00/);

    const pdfLinks = (fixture.nativeElement as HTMLElement).querySelectorAll('a[href$=".pdf"]');
    expect(pdfLinks.length).toBe(1); // only the invoice that has a PDF
  });

  it('shows the empty states when Stripe returned nothing', async () => {
    const fixture = setup(
      { billingEnabled: true, subscriptions: [], invoices: [] },
      { ...PAID_STATUS, isPaid: false, plan: '', interval: '', status: '' },
    );
    const text = await render(fixture);
    expect(text).toContain(fr.subscription.no_history);
    expect(text).toContain(fr.subscription.no_invoices);
  });
});
