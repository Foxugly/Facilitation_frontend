import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { HistoryService } from '../../core/history/history.service';
import { HistoryEntry } from '../../core/history/history.models';
import { LanguageService } from '../../core/i18n/language.service';
import { TeamsService } from '../../core/teams/teams.service';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-history-detail',
  standalone: true,
  imports: [TranslocoModule, ButtonModule, TagModule, PageHeaderComponent],
  styleUrl: './history-detail.scss',
  template: `
    <section class="page">
      <app-page-header [icon]="'pi-history'" [title]="date()">
        <p-button slot="left" [label]="'action.back' | transloco" icon="pi pi-arrow-left" [text]="true" severity="secondary" (onClick)="back()" />
        @if (isManager()) {
          <p-button slot="right" [label]="'history.email' | transloco" icon="pi pi-envelope" [loading]="sending()" (onClick)="sendEmail()" />
        }
      </app-page-header>

      @if (loading()) {
        <p class="meta">…</p>
      } @else if (entries().length === 0) {
        <p style="color: var(--muted)">{{ 'history.empty' | transloco }}</p>
      } @else {
        <ul class="entries">
          @for (e of entries(); track $index) {
            <li class="entry">
              <div class="subject">{{ e.subject }}</div>
              <div class="right">
                <p-tag [value]="levelText(e)" />
                <span class="room">{{ e.roomCode }}</span>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class HistoryDetailComponent implements OnInit {
  private history = inject(HistoryService);
  private teams = inject(TeamsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private language = inject(LanguageService);
  private messages = inject(MessageService);
  private transloco = inject(TranslocoService);
  private readonly lang = this.language.active;

  readonly teamId = signal(0);
  readonly date = signal('');
  readonly entries = signal<HistoryEntry[]>([]);
  readonly loading = signal(true);
  readonly isManager = signal(false);
  readonly sending = signal(false);

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const date = this.route.snapshot.paramMap.get('date') ?? '';
    this.teamId.set(id);
    this.date.set(date);
    try {
      const [detail, team] = await Promise.all([this.history.getDay(id, date), this.teams.getTeam(id)]);
      this.entries.set(detail.entries);
      this.isManager.set(team.my_role === 'owner' || team.my_role === 'manager');
    } finally {
      this.loading.set(false);
    }
  }

  /** Resolve an entry's level to the active-language NAME (not the number). */
  levelText(e: HistoryEntry): string {
    const l = e.levelName;
    if (typeof l === 'string') return l;
    return l[this.lang()] ?? l['en'] ?? Object.values(l)[0] ?? e.chosenValue;
  }

  async sendEmail(): Promise<void> {
    this.sending.set(true);
    try {
      const { sent } = await this.history.emailDay(this.teamId(), this.date());
      this.messages.add({
        severity: 'success',
        summary: this.transloco.translate('history.email_sent', { count: sent }),
      });
    } finally {
      this.sending.set(false);
    }
  }

  back(): void {
    this.router.navigate(['/teams', this.teamId(), 'history']);
  }
}
