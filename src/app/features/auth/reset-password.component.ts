import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';

import { AuthService } from '../../core/auth/auth.service';
import { AuthCardComponent } from '../../shared/components/auth-card/auth-card.component';
import { authErrorKey } from './auth-errors';
import { passwordsMatch } from './passwords-match';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslocoModule, ButtonModule, MessageModule, PasswordModule, AuthCardComponent],
  styleUrl: './auth.scss',
  template: `
    <app-auth-card icon="pi pi-lock" [title]="'auth.reset.title' | transloco">
      @if (done()) {
        <p-message severity="success" [text]="'auth.reset.done' | transloco" />
        <div class="links"><a routerLink="/login">{{ 'auth.login.cta' | transloco }}</a></div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" class="auth-form" novalidate>
          <div class="field">
            <label for="newPassword">{{ 'auth.new_password' | transloco }}</label>
            <p-password
              inputId="newPassword"
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
            <label for="newPasswordConfirm">{{ 'auth.password_confirm' | transloco }}</label>
            <p-password
              inputId="newPasswordConfirm"
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
          <p-button type="submit" [label]="'auth.reset.cta' | transloco" [loading]="busy()" styleClass="u-full" />
        </form>
        <div class="links"><a routerLink="/login">{{ 'auth.back_to_login' | transloco }}</a></div>
      }
    </app-auth-card>
  `,
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private uid = '';
  private token = '';
  readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      passwordConfirm: ['', [Validators.required]],
    },
    { validators: [passwordsMatch('password', 'passwordConfirm')] },
  );
  readonly busy = signal(false);
  readonly submitted = signal(false);
  readonly done = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.uid = this.route.snapshot.paramMap.get('uid') ?? '';
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.busy() || this.form.invalid) return;
    this.busy.set(true);
    try {
      await this.auth.resetPassword(this.uid, this.token, this.form.getRawValue().password);
      this.done.set(true);
    } catch (e) {
      this.error.set(authErrorKey(e, { badRequestKey: 'auth.errors.reset_invalid' }));
    } finally {
      this.busy.set(false);
    }
  }
}
