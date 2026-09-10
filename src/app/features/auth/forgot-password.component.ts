import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { AuthService } from '../../core/auth/auth.service';
import { AuthCardComponent } from '../../shared/components/auth-card/auth-card.component';
import { TurnstileController } from '../../shared/turnstile/turnstile';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslocoModule, ButtonModule, InputTextModule, AuthCardComponent],
  styleUrl: './auth.scss',
  template: `
    <app-auth-card icon="pi pi-key" [title]="'auth.forgot.title' | transloco">
      @if (sent()) {
        <p class="lead ok">{{ 'auth.forgot.sent' | transloco }}</p>
        <div class="links"><a routerLink="/login">{{ 'auth.back_to_login' | transloco }}</a></div>
      } @else {
        <p class="lead">{{ 'auth.forgot.lead' | transloco }}</p>
        <div class="field">
          <label>{{ 'auth.email' | transloco }}</label>
          <input pInputText type="email" [(ngModel)]="email" autocomplete="email" (keyup.enter)="submit()" />
        </div>
        @if (turnstile.enabled) { <div #turnstileEl class="turnstile-widget"></div> }
        @if (error()) { <p class="err">{{ error()! | transloco }}</p> }
        <div class="actions">
          <p-button [label]="'auth.forgot.cta' | transloco" [loading]="busy()" (onClick)="submit()" styleClass="w-full" />
        </div>
        <div class="links"><a routerLink="/login">{{ 'auth.back_to_login' | transloco }}</a></div>
      }
    </app-auth-card>
  `,
})
export class ForgotPasswordComponent implements AfterViewInit, OnDestroy {
  private auth = inject(AuthService);
  protected readonly turnstile = new TurnstileController();
  private readonly turnstileEl = viewChild<ElementRef<HTMLDivElement>>('turnstileEl');
  email = '';
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  ngAfterViewInit(): void {
    this.turnstile.render(this.turnstileEl()?.nativeElement);
  }

  ngOnDestroy(): void {
    this.turnstile.destroy();
  }

  async submit(): Promise<void> {
    this.error.set(null);
    if (!this.email.trim()) return;
    let token = '';
    if (this.turnstile.enabled) {
      token = this.turnstile.readToken();
      if (!token) { this.error.set('auth.errors.captcha'); return; }
    }
    this.busy.set(true);
    try {
      await this.auth.forgotPassword(this.email.trim().toLowerCase(), this.turnstile.enabled ? token : undefined);
      this.sent.set(true);
    } catch (e) {
      if (this.turnstile.enabled && (e as { error?: { code?: string } })?.error?.code === 'captcha_failed') this.turnstile.reset();
      this.error.set('auth.errors.captcha');
    } finally {
      this.busy.set(false);
    }
  }
}
