import { inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs';

/** « {titre de la page} — {nom de l'app} » ; le nom de l'app seul quand la route n'a pas de titre. */
export function composeTitle(page: string | null, app: string): string {
  return page ? `${page} — ${app}` : app;
}

/** Clé i18n `data.titleKey` de la route active la plus profonde qui en déclare une. */
export function titleKeyOf(snapshot: RouterStateSnapshot): string | null {
  let route: ActivatedRouteSnapshot | null = snapshot.root;
  let key: string | null = null;
  while (route) {
    const value = route.data?.['titleKey'];
    if (typeof value === 'string') key = value;
    route = route.firstChild;
  }
  return key;
}

/**
 * Titre d'onglet traduit (WCAG 2.4.2). La clé vient de `data.titleKey` des routes ;
 * le titre est recomposé quand la langue change ou qu'un catalogue arrive (le
 * catalogue se charge après le premier rendu : tant que la clé reste brute, on
 * garde le titre de index.html au lieu d'afficher une clé).
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private titleKey: string | null = null;

  constructor() {
    super();
    this.transloco.events$
      .pipe(
        filter((e) => e.type === 'translationLoadSuccess' || e.type === 'langChanged'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.apply());
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.titleKey = titleKeyOf(snapshot);
    this.apply();
  }

  private apply(): void {
    const app = this.transloco.translate('app.title');
    if (app === 'app.title') return;
    const page = this.titleKey ? this.transloco.translate(this.titleKey) : null;
    if (page === this.titleKey) return;
    this.title.setTitle(composeTitle(page, app));
  }
}
