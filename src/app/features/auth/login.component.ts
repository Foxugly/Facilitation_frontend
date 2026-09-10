import { Component, ElementRef, OnDestroy, effect, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';

import { AuthService } from '../../core/auth/auth.service';
import { AuthCardComponent } from '../../shared/components/auth-card/auth-card.component';
import { TurnstileController } from '../../shared/turnstile/turnstile';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoModule,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    PasswordModule,
    AuthCardComponent,
  ],
  styleUrl: './auth.scss',
  template: `
    <app-auth-card icon="pi pi-sign-in" [title]="'auth.login.title' | transloco">
      @if (!magicMode()) {
        <form [formGroup]="form" (ngSubmit)="submit()" class="auth-form">
          <div class="field">
            <label for="email">{{ 'auth.email' | transloco }}</label>
            <input id="email" pInputText type="email" formControlName="email" autocomplete="username" required />
          </div>
          <div class="field">
            <label for="password">{{ 'auth.password' | transloco }}</label>
            <p-password
              inputId="password"
              formControlName="password"
              [toggleMask]="true"
              [feedback]="false"
              autocomplete="current-password"
              styleClass="u-full"
              [inputStyle]="{ width: '100%' }"
              required
            />
          </div>

          @if (error()) { <p class="err">{{ error()! | transloco }}</p> }
          @if (needsConfirm()) {
            <p class="err">
              {{ 'auth.login.not_confirmed' | transloco }}
              <a (click)="resend()">{{ 'auth.login.resend' | transloco }}</a>
            </p>
          }

          <div class="auth-meta">
            <div class="check-inline">
              <p-checkbox inputId="remember" formControlName="remember" [binary]="true" />
              <label for="remember">{{ 'auth.remember_me' | transloco }}</label>
            </div>
            <a routerLink="/forgot-password" class="link">{{ 'auth.login.forgot' | transloco }}</a>
          </div>

          <p-button
            type="submit"
            [label]="'auth.login.cta' | transloco"
            icon="pi pi-sign-in"
            styleClass="u-full"
            [loading]="busy()"
            [disabled]="busy() || form.invalid"
          />

          <div class="auth-divider"><span>{{ 'auth.or' | transloco }}</span></div>

          <p-button
            [label]="'auth.login.magic' | transloco"
            icon="pi pi-envelope"
            styleClass="u-full magic-btn"
            (onClick)="enterMagicMode()"
          />
        </form>
      } @else {
        <form [formGroup]="magicForm" (ngSubmit)="sendMagic()" class="auth-form">
          <div class="field">
            <label for="magicEmail">{{ 'auth.email' | transloco }}</label>
            <input id="magicEmail" pInputText type="email" formControlName="email" autocomplete="username" required />
          </div>
          @if (magicSent()) { <p class="note ok">{{ 'auth.magic.sent' | transloco }}</p> }
          @if (turnstile.enabled) { <div #magicTurnstileEl class="turnstile-widget"></div> }
          <p-button
            type="submit"
            [label]="'auth.magic.cta' | transloco"
            icon="pi pi-send"
            styleClass="u-full"
            [loading]="magicBusy()"
            [disabled]="magicBusy() || magicForm.invalid"
          />
          <p-button
            [label]="'auth.back_to_password' | transloco"
            icon="pi pi-arrow-left"
            severity="secondary"
            [text]="true"
            styleClass="u-full"
            (onClick)="exitMagicMode()"
          />
        </form>
      }

      <p class="auth-alt">
        {{ 'auth.login.no_account' | transloco }}
        <a routerLink="/register" class="link">{{ 'auth.register.title' | transloco }}</a>
      </p>
    </app-auth-card>
  `,
})
export class LoginComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly turnstile = new TurnstileController();
  private readonly magicTurnstileEl = viewChild<ElementRef<HTMLDivElement>>('magicTurnstileEl');

  constructor() {
    // Le conteneur du widget n'existe qu'en mode magic (@if) ; on (re)rend dès
    // qu'il apparaît. render() est idempotent (garde widgetId).
    effect(() => {
      if (this.magicMode() && this.turnstile.enabled) {
        const el = this.magicTurnstileEl()?.nativeElement;
        if (el) this.turnstile.render(el);
      }
    });
  }

  ngOnDestroy(): void {
    this.turnstile.destroy();
  }

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly needsConfirm = signal(false);
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    remember: [true],
  });

  readonly magicMode = signal(false);
  readonly magicBusy = signal(false);
  readonly magicSent = signal(false);
  readonly magicForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async submit(): Promise<void> {
    this.error.set(null);
    this.needsConfirm.set(false);
    if (this.busy() || this.form.invalid) return;
    this.busy.set(true);
    try {
      const { email, password, remember } = this.form.getRawValue();
      await this.auth.login(email.trim().toLowerCase(), password, remember);
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
      this.router.navigateByUrl(returnUrl);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      const code = (e as { error?: { code?: string } }).error?.code;
      if (status === 403 && code === 'email_not_verified') this.needsConfirm.set(true);
      else this.error.set('auth.errors.invalid_credentials');
    } finally {
      this.busy.set(false);
    }
  }

  async resend(): Promise<void> {
    const email = this.form.getRawValue().email.trim().toLowerCase();
    if (email) await this.auth.resendConfirmation(email);
    this.needsConfirm.set(false);
    this.error.set('auth.login.resent');
  }

  enterMagicMode(): void {
    this.error.set(null);
    this.magicSent.set(false);
    this.magicForm.reset({ email: this.form.getRawValue().email });
    this.magicMode.set(true);
  }

  exitMagicMode(): void {
    this.magicMode.set(false);
    this.turnstile.destroy();
  }

  async sendMagic(): Promise<void> {
    if (this.magicBusy() || this.magicForm.invalid) return;
    let token = '';
    if (this.turnstile.enabled) {
      token = this.turnstile.readToken();
      if (!token) return; // widget visible : l'utilisateur doit résoudre le captcha
    }
    this.magicBusy.set(true);
    try {
      await this.auth.requestMagicLink(
        this.magicForm.getRawValue().email.trim().toLowerCase(),
        this.turnstile.enabled ? token : undefined,
      );
      this.magicSent.set(true);
    } catch (e) {
      if (this.turnstile.enabled && (e as { error?: { code?: string } })?.error?.code === 'captcha_failed') this.turnstile.reset();
    } finally {
      this.magicBusy.set(false);
    }
  }
}
