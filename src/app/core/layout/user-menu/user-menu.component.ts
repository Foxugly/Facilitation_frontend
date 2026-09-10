import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';

import { AuthService } from '../../auth/auth.service';

/**
 * Polymorphic user slot — the last of the topmenu actions (fleet standard §6).
 * Logged out → a "Se connecter" link (outlined emerald) routing to /login.
 * Logged in  → a right-anchored dropdown (name + Déconnexion), hand-rolled (no
 *              PrimeNG p-menu) so it uses the fleet tokens. Closes on outside
 *              click and on Escape, like the sibling language-switcher.
 */
@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [RouterLink, TranslocoModule],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class UserMenuComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const root = this.elementRef.nativeElement;
    if (!root.contains(event.target as Node)) {
      this.close();
    }
  }

  protected async logout(): Promise<void> {
    this.close();
    await this.auth.logout();
    void this.router.navigateByUrl('/');
  }
}
