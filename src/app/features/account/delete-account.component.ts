import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';

import { AuthService } from '../../core/auth/auth.service';

export const DELETE_ACCOUNT_CONFIRM_KEY = 'delete-account';

/** Error `code` of a DRF body: top level, or the first item of a list. */
function errorCode(err: unknown): string | undefined {
  const body = (err as HttpErrorResponse)?.error as { code?: unknown } | null | undefined;
  const code = body?.code;
  if (typeof code === 'string') return code;
  if (Array.isArray(code) && typeof code[0] === 'string') return code[0];
  return undefined;
}

/**
 * « Supprimer mon compte » (RGPD art. 17) — `POST /api/v1/auth/account/delete/`
 * with `{current_password}` (same contract as trainingmanager_server).
 *
 * The p-confirmdialog states what goes with the account and holds the password
 * field; it stays open on a wrong password so the user can retry in place.
 * 204: the server already revoked every refresh token, so the local session is
 * dropped and the user lands on the home page with a toast. 409 `owns_teams`:
 * the teams must be transferred or deleted first.
 */
@Component({
  selector: 'app-delete-account',
  standalone: true,
  imports: [FormsModule, TranslocoModule, ButtonModule, ConfirmDialogModule, MessageModule, PasswordModule],
  providers: [ConfirmationService],
  template: `
    <div class="section delete-account" data-testid="delete-account">
      <h3>{{ 'me.delete.title' | transloco }}</h3>
      <p class="meta-hint">{{ 'me.delete.lead' | transloco }}</p>
      <p-button [label]="'me.delete.button' | transloco" icon="pi pi-trash" severity="danger"
                data-testid="delete-account-open" (onClick)="open()" />
    </div>

    <p-confirmdialog [key]="confirmKey" [closable]="!pending()" [closeOnEscape]="!pending()"
                     [style]="{ width: '34rem' }" [breakpoints]="{ '640px': '94vw' }">
      <ng-template #message>
        <form class="delete-account__dialog" (submit)="$event.preventDefault(); submit()">
          <p>{{ 'me.delete.dialog_intro' | transloco }}</p>
          <p>{{ 'me.delete.dialog_teams' | transloco }}</p>
          <label for="delete-account-password">{{ 'me.delete.password' | transloco }}</label>
          <p-password inputId="delete-account-password" name="current_password" autocomplete="current-password"
                      [ngModel]="password()" (ngModelChange)="password.set($event)"
                      [feedback]="false" [toggleMask]="true" [fluid]="true" />
          @if (error(); as message) {
            <p-message severity="error" data-testid="delete-account-error">{{ message }}</p-message>
          }
        </form>
      </ng-template>
      <ng-template #footer>
        <p-button type="button" severity="secondary" [outlined]="true" [label]="'action.cancel' | transloco"
                  [disabled]="pending()" (onClick)="cancel()" />
        <p-button type="button" severity="danger" icon="pi pi-trash" [label]="'me.delete.confirm' | transloco"
                  data-testid="delete-account-confirm" [loading]="pending()" [disabled]="pending()" (onClick)="submit()" />
      </ng-template>
    </p-confirmdialog>
  `,
  styles: `
    .delete-account__dialog { display: flex; flex-direction: column; gap: 0.75rem; }
    .delete-account__dialog p { margin: 0; }
  `,
})
export class DeleteAccountComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);
  private transloco = inject(TranslocoService);

  readonly confirmKey = DELETE_ACCOUNT_CONFIRM_KEY;
  readonly password = signal('');
  readonly pending = signal(false);
  /** Localized message shown in the dialog. */
  readonly error = signal<string | null>(null);

  open(): void {
    this.password.set('');
    this.error.set(null);
    this.confirmation.confirm({ key: this.confirmKey, header: this.transloco.translate('me.delete.dialog_title') });
  }

  cancel(): void {
    if (this.pending()) return;
    this.confirmation.close();
  }

  async submit(): Promise<void> {
    if (this.pending()) return;
    const currentPassword = this.password();
    if (!currentPassword) {
      this.error.set(this.transloco.translate('me.delete.password_required'));
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      await this.auth.deleteAccount(currentPassword);
    } catch (err) {
      this.error.set(this.errorMessage(err));
      return;
    } finally {
      this.pending.set(false);
    }
    this.confirmation.close();
    this.password.set('');
    await this.router.navigate(['/home']);
    this.messages.add({ severity: 'success', summary: this.transloco.translate('me.delete.success'), life: 8000 });
  }

  private errorMessage(err: unknown): string {
    const status = (err as HttpErrorResponse)?.status;
    const code = errorCode(err);
    if (code === 'owns_teams' || status === 409) return this.transloco.translate('me.delete.owns_teams');
    if (code === 'current_password_invalid' || status === 400) return this.transloco.translate('me.delete.password_invalid');
    if (status === 429) return this.transloco.translate('me.delete.throttled');
    return this.transloco.translate('auth.errors.generic');
  }
}
