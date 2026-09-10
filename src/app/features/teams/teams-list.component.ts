import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';

import { BillingService, Interval, Plan, SubscriptionStatus } from '../../core/billing/billing.service';
import { needsSubscription as needsSubscriptionRule, quotaReached as quotaReachedRule } from '../../core/billing/gating';
import { TeamsService } from '../../core/teams/teams.service';
import { Team } from '../../core/teams/teams.models';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

interface PlanOption {
  plan: Plan;
  interval: Interval;
  price: string;
  per: string;
  quota: number;
}

@Component({
  selector: 'app-teams-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    TranslocoModule,
    ButtonModule,
    InputTextModule,
    SkeletonModule,
    TagModule,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  styleUrl: './teams.scss',
  template: `
    <section class="page">
      <app-page-header [icon]="'pi-users'" [title]="'teams.title' | transloco">
        @if (canCreate()) {
          <p-button slot="right" [label]="'teams.create' | transloco" icon="pi pi-plus" severity="success" (onClick)="toggleCreate()" />
        }
        @if (sub()?.canManage) {
          <p-button slot="right" [label]="'billing.manage' | transloco" icon="pi pi-credit-card" [outlined]="true" severity="secondary" (onClick)="manage()" />
        }
      </app-page-header>

      @if (sub()?.bypass) {
        <p-tag severity="success" icon="pi pi-gift" [value]="'billing.offered_access' | transloco" />
      }

      <!-- No subscription yet (billing live): show the plans -->
      @if (needsSubscription()) {
        <p class="lead" style="margin-bottom: var(--s-4)">{{ 'billing.choose' | transloco }}</p>
        <div class="grid">
          @for (p of plans; track p.plan + p.interval) {
            <div class="plan-card">
              <span class="plan-quota"><i class="pi pi-users"></i> {{ p.quota }} {{ 'billing.teams' | transloco }}</span>
              <div class="plan-price">{{ p.price }}<span class="plan-per">/{{ p.per | transloco }}</span></div>
              <p-button [label]="'billing.subscribe' | transloco" icon="pi pi-star" severity="success" styleClass="w-full"
                        [loading]="busy()" (onClick)="subscribe(p)" />
            </div>
          }
        </div>
      } @else {
        @if (showCreate()) {
          <div class="create-row">
            <input pInputText [placeholder]="'teams.name' | transloco" [(ngModel)]="name" (keyup.enter)="create()" />
            <p-button [label]="'teams.create' | transloco" [loading]="busy()" (onClick)="create()" />
          </div>
        }

        @if (sub()?.billingEnabled && sub()?.isPaid) {
          <p class="meta quota-line">
            {{ 'billing.quota' | transloco }}: {{ sub()!.teamsUsed }} / {{ sub()!.quota }}
            @if (quotaReached()) { · {{ 'billing.quota_reached' | transloco }} }
          </p>
        }

        @if (loading()) {
          <div class="grid">
            @for (i of [1, 2, 3]; track i) {
              <div class="team-card">
                <p-skeleton width="60%" height="1.25rem" styleClass="skeleton-line" />
                <p-skeleton width="40%" height="0.9rem" />
              </div>
            }
          </div>
        } @else if (teams().length === 0) {
          <app-empty-state icon="pi pi-users" [title]="'teams.empty' | transloco" />
        } @else {
          <div class="grid">
            @for (team of teams(); track team.id) {
              <a class="team-card" [routerLink]="['/teams', team.id]">
                <h3>{{ team.name }}</h3>
                <div class="meta">
                  <p-tag [value]="'teams.role.' + team.my_role | transloco" severity="secondary" />
                  <span>{{ team.member_count }} {{ 'teams.members' | transloco }}</span>
                </div>
              </a>
            }
          </div>
        }
      }
    </section>
  `,
})
export class TeamsListComponent implements OnInit {
  private teamsService = inject(TeamsService);
  private billing = inject(BillingService);
  private route = inject(ActivatedRoute);
  private messages = inject(MessageService);
  private transloco = inject(TranslocoService);

  readonly teams = signal<Team[]>([]);
  readonly sub = signal<SubscriptionStatus | null>(null);
  readonly loading = signal(true);
  readonly showCreate = signal(false);
  readonly busy = signal(false);
  name = '';

  readonly plans: PlanOption[] = [
    { plan: 'team1', interval: 'monthly', price: '5 €', per: 'billing.per_month', quota: 1 },
    { plan: 'team1', interval: 'yearly', price: '50 €', per: 'billing.per_year', quota: 1 },
    { plan: 'team5', interval: 'monthly', price: '20 €', per: 'billing.per_month', quota: 5 },
    { plan: 'team5', interval: 'yearly', price: '200 €', per: 'billing.per_year', quota: 5 },
  ];

  // Show plans only when billing is live and the account has no active subscription.
  readonly needsSubscription = computed(() => needsSubscriptionRule(this.sub()));
  readonly quotaReached = computed(() => quotaReachedRule(this.sub()));
  readonly canCreate = computed(() => !this.needsSubscription() && !this.quotaReached());

  async ngOnInit(): Promise<void> {
    await this.reload();
    const billing = this.route.snapshot.queryParamMap.get('billing');
    if (billing === 'success') {
      this.messages.add({ severity: 'success', summary: this.transloco.translate('billing.success') });
    } else if (billing === 'cancel') {
      this.messages.add({ severity: 'info', summary: this.transloco.translate('billing.canceled') });
    }
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const [teams, sub] = await Promise.all([this.teamsService.listTeams(), this.billing.status()]);
      this.teams.set(teams);
      this.sub.set(sub);
    } finally {
      this.loading.set(false);
    }
  }

  toggleCreate(): void {
    this.showCreate.update((v) => !v);
  }

  async create(): Promise<void> {
    const name = this.name.trim();
    if (!name) return;
    this.busy.set(true);
    try {
      const team = await this.teamsService.createTeam(name);
      this.teams.update((list) => [...list, team]);
      this.name = '';
      this.showCreate.set(false);
      await this.reload();
    } catch {
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    } finally {
      this.busy.set(false);
    }
  }

  async subscribe(p: PlanOption): Promise<void> {
    this.busy.set(true);
    try {
      await this.billing.subscribe(p.plan, p.interval);
    } catch {
      this.busy.set(false);
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    }
  }

  async manage(): Promise<void> {
    this.busy.set(true);
    try {
      await this.billing.manage();
    } catch {
      this.busy.set(false);
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    }
  }
}
