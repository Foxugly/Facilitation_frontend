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
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslocoModule, ButtonModule, InputTextModule, AuthCardComponent],
  styleUrl: './auth.scss',
  template: `
    <app-auth-card
      icon="pi pi-user-plus"
      [title]="(done() ? 'auth.register.done_title' : 'auth.register.title') | transloco"
    >
      @if (done()) {
        <p class="lead">{{ 'auth.register.done_lead' | transloco }}</p>
        <div class="links"><a routerLink="/login">{{ 'auth.login.cta' | transloco }}</a></div>
      } @else {
        <p class="lead">{{ 'auth.register.lead' | transloco }}</p>
        <div class="field">
          <label>{{ 'auth.display_name' | transloco }}</label>
          <input pInputText [(ngModel)]="displayName" autocomplete="nickname" />
        </div>
        <div class="field">
          <label>{{ 'auth.email' | transloco }}</label>
          <input pInputText type="email" [(ngModel)]="email" autocomplete="email" />
        </div>
        <div class="field">
          <label>{{ 'auth.password' | transloco }}</label>
          <input pInputText type="password" [(ngModel)]="password" autocomplete="new-password" />
          @if (submitted() && password.length < 8) { <p class="err">{{ 'auth.errors.password_short' | transloco }}</p> }
        </div>
        @if (error()) { <p class="err">{{ error()! | transloco }}</p> }
        @if (turnstile.enabled) { <div #turnstileEl class="turnstile-widget"></div> }
        <div class="actions">
          <p-button [label]="'auth.register.cta' | transloco" severity="success" [loading]="busy()" (onClick)="submit()" styleClass="w-full" />
        </div>
        <div class="links"><span>{{ 'auth.register.have_account' | transloco }} <a routerLink="/login">{{ 'auth.login.cta' | transloco }}</a></span></div>
      }
    </app-auth-card>
  `,
})
export class RegisterComponent implements AfterViewInit, OnDestroy {
  private auth = inject(AuthService);
  protected readonly turnstile = new TurnstileController();
  private readonly turnstileEl = viewChild<ElementRef<HTMLDivElement>>('turnstileEl');
  displayName = '';
  email = '';
  password = '';
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
    if (!this.email.trim() || this.password.length < 8) return;
    let token = '';
    if (this.turnstile.enabled) {
      token = this.turnstile.readToken();
      if (!token) { this.error.set('auth.errors.captcha'); return; }
    }
    this.busy.set(true);
    try {
      await this.auth.register(
        this.email.trim().toLowerCase(), this.password, this.displayName.trim(),
        this.turnstile.enabled ? token : undefined,
      );
      this.done.set(true);
    } catch (e) {
      if (this.turnstile.enabled && (e as { error?: { code?: string } })?.error?.code === 'captcha_failed') this.turnstile.reset();
      this.error.set('auth.errors.generic');
    } finally {
      this.busy.set(false);
    }
  }
}
