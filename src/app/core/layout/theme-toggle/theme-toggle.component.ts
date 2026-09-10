import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ThemeService } from '../../theme/theme.service';

/**
 * Dark/light toggle — a custom rectangular button (fleet standard §5.4: NOT a
 * rounded p-button, so its hover matches the other topbar actions). Sits first
 * in the topbar actions (theme → language → user).
 */
@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `
    <button
      type="button"
      class="theme-toggle"
      [attr.aria-label]="theme.theme() === 'dark' ? 'Light mode' : 'Dark mode'"
      (click)="theme.toggle()"
    >
      <i class="pi" [class.pi-sun]="theme.theme() === 'dark'" [class.pi-moon]="theme.theme() !== 'dark'"></i>
    </button>
  `,
  styles: [
    `
      .theme-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.35rem;
        height: 2.35rem;
        border: none;
        border-radius: var(--radius);
        background: transparent;
        color: var(--chrome-ink);
        cursor: pointer;
        transition: background 160ms ease;
      }
      .theme-toggle:hover {
        background: rgba(255, 255, 255, 0.12);
        color: var(--chrome-ink-strong);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
}
