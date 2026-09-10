import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs';

import { AVAILABLE_LANGS, AppLang, DEFAULT_LANG } from './available-languages';

const LANG_KEY = 'poker.lang';

/** Per-participant UI language (browser detection + manual switch, scope §10). */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private transloco = inject(TranslocoService);
  readonly active = signal<AppLang>(DEFAULT_LANG);

  // Transloco charge ses catalogues apres le premier rendu. Le pipe | transloco
  // s'abonne a cette arrivee, mais pas translate() : un computed qui l'appelle
  // trop tot rend la clef brute, la met en cache, et — la langue n'ayant pas
  // change — ne se recalcule plus jamais. Ce compteur donne a ces computed la
  // dependance qui leur manque.
  private readonly loads = signal(0);

  /** A lire dans tout computed qui appelle transloco.translate(). */
  readonly revision = computed(() => `${this.active()}#${this.loads()}`);

  constructor() {
    this.transloco.events$
      .pipe(
        filter((e) => e.type === 'translationLoadSuccess'),
        takeUntilDestroyed(),
      )
      // queueMicrotask, pas un set direct : le catalogue est demande *pendant* le
      // rendu (par le pipe | transloco), et l'evenement revient donc souvent dans
      // ce meme rendu — ecrire un signal la leve NG0600. On repousse au tick
      // suivant, ou l'ecriture est legitime et provoque un nouveau rendu.
      .subscribe(() => queueMicrotask(() => this.loads.update((n) => n + 1)));
  }

  init(): void {
    const lang = this.resolveInitial();
    this.set(lang);
  }

  set(lang: AppLang): void {
    this.active.set(lang);
    this.transloco.setActiveLang(lang);
    localStorage.setItem(LANG_KEY, lang);
  }

  private resolveInitial(): AppLang {
    const stored = localStorage.getItem(LANG_KEY) as AppLang | null;
    if (stored && AVAILABLE_LANGS.includes(stored)) return stored;
    const nav = (navigator.language || '').slice(0, 2) as AppLang;
    return AVAILABLE_LANGS.includes(nav) ? nav : DEFAULT_LANG;
  }
}
