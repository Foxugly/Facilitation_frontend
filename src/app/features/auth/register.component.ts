import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';

import { AuthService } from '../../core/auth/auth.service';
import { AuthCardComponent } from '../../shared/components/auth-card/auth-card.component';
import { TurnstileController } from '../../shared/turnstile/turnstile';
import { authErrorKey } from './auth-errors';
import { passwordsMatch } from './passwords-match';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    AuthCardComponent,
  ],
  styleUrl: './auth.scss',
  template: `
    <app-auth-card
      icon="pi pi-user-plus"
      [title]="(done() ? 'auth.register.done_title' : 'auth.register.title') | transloco"
    >
      @if (done()) {
        <p-message severity="success" [text]="'auth.register.done_lead' | transloco" />
        <div class="links"><a routerLink="/login">{{ 'auth.back_to_login' | transloco }}</a></div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" class="auth-form" novalidate>
          <div class="field">
            <label for="displayName">{{ 'auth.display_name' | transloco }}</label>
            <input id="displayName" pInputText formControlName="displayName" autocomplete="nickname" />
          </div>
          <div class="field">
            <label for="email">{{ 'auth.email' | transloco }}</label>
            <input id="email" pInputText type="email" formControlName="email" autocomplete="email" required />
          </div>
          <div class="field">
            <label for="password">{{ 'auth.password' | transloco }}</label>
            <p-password
              inputId="password"
              formControlName="password"
              [toggleMask]="true"
              [feedback]="false"
              autocomplete="new-password"
              styleClass="u-full"
              [inputStyle]="{ width: '100%' }"
            />
            @if (submitted() && form.controls.password.errors) {
              <p class="err">{{ 'auth.errors.password_short' | transloco }}</p>
            }
          </div>
          <div class="field">
            <label for="passwordConfirm">{{ 'auth.password_confirm' | transloco }}</label>
            <p-password
              inputId="passwordConfirm"
              formControlName="passwordConfirm"
              [toggleMask]="true"
              [feedback]="false"
              autocomplete="new-password"
              styleClass="u-full"
              [inputStyle]="{ width: '100%' }"
            />
            @if (submitted() && form.errors?.['mismatch']) {
              <p class="err">{{ 'auth.errors.password_mismatch' | transloco }}</p>
            }
          </div>
          @if (error()) { <p-message severity="error" [text]="error()! | transloco" /> }
          @if (turnstile.enabled) { <div #turnstileEl class="turnstile-widget"></div> }
          <p-button
            type="submit"
            [label]="'auth.register.cta' | transloco"
            severity="success"
            [loading]="busy()"
            styleClass="u-full"
          />
        </form>
        <p class="auth-alt">
          {{ 'auth.register.have_account' | transloco }}
          <a routerLink="/login" class="link">{{ 'auth.login.cta' | transloco }}</a>
        </p>
      }
    </app-auth-card>
  `,
})
export class RegisterComponent implements AfterViewInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private auth = inject(AuthService);
  protected readonly turnstile = new TurnstileController();
  private readonly turnstileEl = viewChild<ElementRef<HTMLDivElement>>('turnstileEl');
  readonly form = this.fb.nonNullable.group(
    {
      displayName: [''],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      passwordConfirm: ['', [Validators.required]],
    },
    { validators: [passwordsMatch('password', 'passwordConfirm')] },
  );
  readonly busy = signal(false);
  readonly submitted = signal(false);
  readonly done = signal(false);
  readonly error = signal<string | null>(null);

  ngAfterViewInit(): void {
    this.turnstile.render(this.turnstileEl()?.nativeElement);
  }

  ngOnDestroy(): void {
    this.turnstile.destroy();
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.busy() || this.form.invalid) return;
    let token = '';
    if (this.turnstile.enabled) {
      token = this.turnstile.readToken();
      if (!token) { this.error.set('auth.errors.captcha'); return; }
    }
    this.busy.set(true);
    try {
      const { email, password, displayName } = this.form.getRawValue();
      await this.auth.register(
        email.trim().toLowerCase(), password, displayName.trim(),
        this.turnstile.enabled ? token : undefined,
      );
      this.done.set(true);
    } catch (e) {
      if (this.turnstile.enabled && (e as { error?: { code?: string } })?.error?.code === 'captcha_failed') this.turnstile.reset();
      this.error.set(authErrorKey(e));
    } finally {
      this.busy.set(false);
    }
  }
}
