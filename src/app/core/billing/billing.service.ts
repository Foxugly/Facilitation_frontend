import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { getRuntimeConfig } from '../runtime-config';

export type Plan = 'team1' | 'team5';
export type Interval = 'monthly' | 'yearly';

export interface SubscriptionStatus {
  billingEnabled: boolean;
  isPaid: boolean;
  status: string;
  plan: string;
  interval: string;
  quota: number;
  teamsUsed: number;
  canManage: boolean;
  /** Accès offert : le compte a tous les droits payants sans souscription. */
  bypass: boolean;
}

/** Read live from Stripe — nothing about invoices is mirrored in our database. */
export interface BillingSubscriptionEntry {
  id: string;
  status: string;
  plan: string;
  interval: string;
  startedAt: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
}

export interface BillingInvoice {
  id: string;
  number: string;
  status: string;
  /** In cents. */
  amountPaid: number;
  currency: string;
  createdAt: string | null;
  hostedUrl: string;
  pdfUrl: string;
}

export interface BillingHistory {
  billingEnabled: boolean;
  subscriptions: BillingSubscriptionEntry[];
  invoices: BillingInvoice[];
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  private http = inject(HttpClient);
  private base = getRuntimeConfig().apiBaseUrl + '/api/v1/billing';

  status() {
    return firstValueFrom(this.http.get<SubscriptionStatus>(`${this.base}/subscription/`));
  }

  history() {
    return firstValueFrom(this.http.get<BillingHistory>(`${this.base}/history/`));
  }

  /** Start a subscription for a plan+interval: redirects to Stripe Checkout. */
  async subscribe(plan: Plan, interval: Interval): Promise<void> {
    const { url } = await firstValueFrom(
      this.http.post<{ url: string }>(`${this.base}/checkout/`, { plan, interval }),
    );
    window.location.href = url;
  }

  /** Open the Stripe billing portal to manage/cancel. */
  async manage(): Promise<void> {
    const { url } = await firstValueFrom(this.http.post<{ url: string }>(`${this.base}/portal/`, {}));
    window.location.href = url;
  }
}
