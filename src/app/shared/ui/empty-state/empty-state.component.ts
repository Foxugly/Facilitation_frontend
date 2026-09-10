import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Empty-state brick (fleet standard) : centered icon + title + optional message,
 * with an optional projected action (e.g. a "create" button). Use when a list or
 * resource has nothing to show yet.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="empty">
      <i class="empty__icon" [class]="icon()"></i>
      <p class="empty__title">{{ title() }}</p>
      @if (message()) {
        <p class="empty__message">{{ message() }}</p>
      }
      <div class="empty__actions">
        <ng-content />
      </div>
    </div>
  `,
  styles: [
    `
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 0.5rem;
        padding: 2.5rem 1.5rem;
        color: var(--muted);
      }
      .empty__icon {
        font-size: 2.25rem;
        color: var(--accent);
        margin-bottom: 0.25rem;
      }
      .empty__title {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 600;
        color: var(--ink);
      }
      .empty__message {
        margin: 0;
        max-width: 32rem;
        line-height: 1.6;
      }
      .empty__actions:empty {
        display: none;
      }
      .empty__actions {
        margin-top: 0.75rem;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly icon = input('pi pi-inbox');
  readonly title = input('');
  readonly message = input('');
}
