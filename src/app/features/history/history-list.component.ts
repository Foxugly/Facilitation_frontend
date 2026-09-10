import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';

import { HistoryService } from '../../core/history/history.service';
import { HistoryDay } from '../../core/history/history.models';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-history-list',
  standalone: true,
  imports: [RouterLink, TranslocoModule, ButtonModule, SkeletonModule, PageHeaderComponent, EmptyStateComponent],
  styleUrl: '../teams/teams.scss',
  template: `
    <section class="page">
      <app-page-header [icon]="'pi-history'" [title]="'history.title' | transloco">
        <p-button slot="left" [label]="'action.back' | transloco" icon="pi pi-arrow-left" [text]="true" severity="secondary" (onClick)="back()" />
      </app-page-header>

      @if (loading()) {
        <div class="grid">
          @for (i of [1, 2, 3]; track i) {
            <div class="team-card">
              <p-skeleton width="50%" height="1.25rem" styleClass="skeleton-line" />
              <p-skeleton width="35%" height="0.9rem" />
            </div>
          }
        </div>
      } @else if (days().length === 0) {
        <app-empty-state icon="pi pi-history" [title]="'history.empty' | transloco" />
      } @else {
        <div class="grid">
          @for (d of days(); track d.date) {
            <a class="team-card" [routerLink]="['/teams', teamId(), 'history', d.date]">
              <h3>{{ d.date }}</h3>
              <div class="meta">
                <span>{{ d.count }} {{ 'history.results' | transloco }}</span>
              </div>
            </a>
          }
        </div>
      }
    </section>
  `,
})
export class HistoryListComponent implements OnInit {
  private history = inject(HistoryService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly teamId = signal(0);
  readonly days = signal<HistoryDay[]>([]);
  readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.teamId.set(id);
    try {
      this.days.set((await this.history.listDays(id)).days);
    } finally {
      this.loading.set(false);
    }
  }

  back(): void {
    this.router.navigate(['/teams', this.teamId()]);
  }
}
