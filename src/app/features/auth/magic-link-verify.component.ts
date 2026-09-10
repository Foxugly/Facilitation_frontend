import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';

import { AuthService } from '../../core/auth/auth.service';
import { AuthCardComponent } from '../../shared/components/auth-card/auth-card.component';

@Component({
  selector: 'app-magic-link-verify',
  standalone: true,
  imports: [RouterLink, TranslocoModule, AuthCardComponent],
  styleUrl: './auth.scss',
  template: `
    <app-auth-card
      icon="pi pi-link"
      [title]="(state() === 'error' ? 'auth.magic.error_title' : 'auth.magic.verifying') | transloco"
    >
      @if (state() === 'error') {
        <p class="lead err">{{ 'auth.magic.error_lead' | transloco }}</p>
        <div class="links"><a routerLink="/login">{{ 'auth.magic.request_new' | transloco }}</a></div>
      }
    </app-auth-card>
  `,
})
export class MagicLinkVerifyComponent implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly state = signal<'pending' | 'error'>('pending');

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    try {
      await this.auth.verifyMagicLink(token);
      this.router.navigateByUrl('/');
    } catch {
      this.state.set('error');
    }
  }
}
