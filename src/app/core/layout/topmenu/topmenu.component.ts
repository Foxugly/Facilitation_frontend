import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';

import { AuthService } from '../../auth/auth.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher/language-switcher.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { UserMenuComponent } from '../user-menu/user-menu.component';

/**
 * Public topbar (fleet chrome, STANDARD-frontend-layout.md): a 3-column grid
 * (brand · centered pill nav · right actions) over a dark gradient. Right actions
 * order = theme → language → user (§ topmenu). Collapses to a hamburger drawer at
 * the `lg` breakpoint (1024px).
 */
@Component({
  selector: 'app-topmenu',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    TranslocoModule,
    LanguageSwitcherComponent,
    ThemeToggleComponent,
    UserMenuComponent,
  ],
  host: { '(document:click)': 'closeMobile($event)' },
  templateUrl: './topmenu.component.html',
  styleUrl: './topmenu.component.scss',
})
export class TopmenuComponent {
  readonly auth = inject(AuthService);
  private router = inject(Router);

  @ViewChild('root') private root?: ElementRef<HTMLElement>;
  readonly mobileOpen = signal(false);

  toggleMobile(event: MouseEvent): void {
    event.stopPropagation();
    this.mobileOpen.update((v) => !v);
  }

  closeMobile(event: Event): void {
    if (this.root && !this.root.nativeElement.contains(event.target as Node)) {
      this.mobileOpen.set(false);
    }
  }
}
