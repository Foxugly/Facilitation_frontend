import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Shared auth card shell (fleet standard §Pages d'authentification): the centred
 * ~420px card with a branded header (icon + title, both centred) used by every
 * auth screen (login, register, forgot/reset password, magic-link). The form
 * body, messages and links are projected via <ng-content>; their styles live in
 * the calling component (shared `auth.scss`, view encapsulation).
 */
@Component({
  selector: 'app-auth-card',
  standalone: true,
  template: `
    <div class="auth-card">
      <div class="auth-card__header">
        <i [class]="icon()" class="auth-card__icon" aria-hidden="true"></i>
        <h1 class="auth-card__title">{{ title() }}</h1>
      </div>
      <ng-content />
    </div>
  `,
  styleUrl: './auth-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCardComponent {
  readonly icon = input.required<string>();
  readonly title = input.required<string>();
}
