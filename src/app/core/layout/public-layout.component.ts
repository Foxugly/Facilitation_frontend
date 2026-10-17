import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';

import { FooterComponent } from './footer/footer.component';
import { TopmenuComponent } from './topmenu/topmenu.component';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [RouterOutlet, TranslocoModule, ConfirmDialogModule, ToastModule, TopmenuComponent, FooterComponent],
  template: `
    <div class="fox-shell">
      <a href="#main-content" class="fox-skip-link">{{ 'common.skip_to_content' | transloco }}</a>
      <app-topmenu />
      <main id="main-content" tabindex="-1" class="main-container">
        <router-outlet />
      </main>
      <app-footer />
      <p-toast />
      <p-confirmdialog />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {}
