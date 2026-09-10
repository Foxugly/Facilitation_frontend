import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';

import { AuthService } from '../../core/auth/auth.service';
import { AuthCardComponent } from '../../shared/components/auth-card/auth-card.component';

@Component({
  selector: 'app-confirm-email',
  standalone: true,
  imports: [RouterLink, TranslocoModule, AuthCardComponent],
  styleUrl: './auth.scss',
  template: `
    <app-auth-card icon="pi pi-check-circle" [title]="titleKey() | transloco">
      @switch (state()) {
        @case ('ok') {
          <p class="lead">{{ 'auth.confirm.ok_lead' | transloco }}</p>
        }
        @case ('error') {
          <p class="lead err">{{ 'auth.confirm.error_lead' | transloco }}</p>
          <div class="links"><a routerLink="/login">{{ 'auth.back_to_login' | transloco }}</a></div>
        }
      }
    </app-auth-card>
  `,
})
export class ConfirmEmailComponent implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly state = signal<'pending' | 'ok' | 'error'>('pending');
  readonly titleKey = computed(() => {
    switch (this.state()) {
      case 'ok':
        return 'auth.confirm.ok_title';
      case 'error':
        return 'auth.confirm.error_title';
      default:
        return 'auth.confirm.pending';
    }
  });

  async ngOnInit(): Promise<void> {
    const uid = this.route.snapshot.paramMap.get('uid') ?? '';
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    try {
      await this.auth.confirmEmail(uid, token);
      this.state.set('ok');
      setTimeout(() => this.router.navigateByUrl('/'), 1200);
    } catch {
      this.state.set('error');
    }
  }
}
