import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Fleet footer (core/layout, STANDARD-frontend-layout.md §Footer): full-width
 * band, inner capped on the content grid, BEM `footer__*`. Segments: brand ·
 * tagline · (fill) · «Version {x}» · © {year} Foxugly (logo → foxugly.com) ·
 * Privacy · rights. Version is injected at deploy time (`window.__POKER_VERSION`
 * via SSM), else `dev`. Colours come from the design tokens (dark mode auto).
 */
@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, TranslocoModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  readonly year = new Date().getFullYear();
  /** Runtime build version injected at deploy time; `dev` in local builds. */
  readonly version =
    (globalThis as { __POKER_VERSION?: string }).__POKER_VERSION || 'dev';
}
