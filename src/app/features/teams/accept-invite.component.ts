import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';

import { TeamsService } from '../../core/teams/teams.service';

@Component({
  selector: 'app-accept-invite',
  standalone: true,
  imports: [RouterLink, TranslocoModule],
  styleUrl: '../auth/auth.scss',
  template: `
    <section class="auth">
      @switch (state()) {
        @case ('pending') { <h1>{{ 'teams.accept.pending' | transloco }}</h1> }
        @case ('error') {
          <h1>{{ 'teams.accept.error_title' | transloco }}</h1>
          <p class="lead err">{{ error() | transloco }}</p>
          <div class="links"><a routerLink="/teams">{{ 'teams.title' | transloco }}</a></div>
        }
      }
    </section>
  `,
})
export class AcceptInviteComponent implements OnInit {
  private teamsService = inject(TeamsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly state = signal<'pending' | 'error'>('pending');
  readonly error = signal('teams.accept.error_lead');

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    try {
      const team = await this.teamsService.acceptInvite(token);
      this.router.navigate(['/teams', team.id]);
    } catch (e: unknown) {
      const code = (e as { error?: { code?: string } }).error?.code;
      if (code === 'invite_email_mismatch') this.error.set('teams.accept.email_mismatch');
      this.state.set('error');
    }
  }
}
