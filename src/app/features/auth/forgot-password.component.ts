import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

import { AuthService } from '../../core/auth/auth.service';
import { AuthCardComponent } from '../../shared/components/auth-card/auth-card.component';
import { TurnstileController } from '../../shared/turnstile/turnstile';
import { authErrorKey } from './auth-errors';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslocoModule, ButtonModule, InputTextModule, MessageModule, AuthCardComponent],
  styleUrl: './auth.scss',
  template: `
    <app-auth-card icon="pi pi-key" [title]="'auth.forgot.title' | transloco">
      @if (sent()) {
        <p-message severity="success" [text]="'auth.forgot.sent' | transloco" />
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" class="auth-form" novalidate>
          <p class="lead">{{ 'auth.forgot.lead' | transloco }}</p>
          <div class="field">
            <label for="email">{{ 'auth.email' | transloco }}</label>
            <input id="email" pInputText type="email" formControlName="email" autocomplete="email" required />
          </div>
          @if (turnstile.enabled) { <div #turnstileEl class="turnstile-widget"></div> }
          @if (error()) { <p-message severity="error" [text]="error()! | transloco" /> }
          <p-button type="submit" [label]="'auth.forgot.cta' | transloco" [loading]="busy()" styleClass="u-full" />
        </form>
      }
      <div class="links"><a routerLink="/login">{{ 'auth.back_to_login' | transloco }}</a></div>
    </app-auth-card>
  `,
})
export class ForgotPasswordComponent implements AfterViewInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private auth = inject(AuthService);
  protected readonly turnstile = new TurnstileController();
  private readonly turnstileEl = viewChild<ElementRef<HTMLDivElement>>('turnstileEl');
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
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
    if (this.busy() || this.form.invalid) return;
    let token = '';
    if (this.turnstile.enabled) {
      token = this.turnstile.readToken();
      if (!token) { this.error.set('auth.errors.captcha'); return; }
    }
    this.busy.set(true);
    try {
      await this.auth.forgotPassword(this.form.getRawValue().email.trim().toLowerCase(), this.turnstile.enabled ? token : undefined);
      this.sent.set(true);
    } catch (e) {
      if (this.turnstile.enabled && (e as { error?: { code?: string } })?.error?.code === 'captcha_failed') this.turnstile.reset();
      this.error.set(authErrorKey(e));
    } finally {
      this.busy.set(false);
    }
  }
}
