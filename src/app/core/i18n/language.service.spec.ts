import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { LanguageService } from './language.service';

/**
 * Transloco loads its catalogues after the first render. The `| transloco` pipe
 * subscribes to that arrival; `translate()` does not — so a computed() calling it
 * too early renders the raw key, caches it, and never recomputes, since the active
 * language has not changed. That is exactly how the Dépouillement sub-tab ended up
 * displaying `teams.result_layout.cards`. `revision` is the dependency those
 * computed signals read to be woken up.
 */
function serviceWithEvents() {
  const events$ = new Subject<{ type: string }>();
  TestBed.configureTestingModule({
    providers: [
      LanguageService,
      { provide: TranslocoService, useValue: { events$, setActiveLang: vi.fn() } },
    ],
  });
  return { events$, service: TestBed.inject(LanguageService) };
}

describe('LanguageService.revision', () => {
  it('change quand un catalogue arrive, sans bascule de langue', async () => {
    const { events$, service } = serviceWithEvents();
    const before = service.revision();

    events$.next({ type: 'translationLoadSuccess' });
    // L'ecriture est repoussee d'une microtache pour ne pas tomber pendant un rendu.
    await Promise.resolve();

    expect(service.revision()).not.toBe(before);
  });

  it('ignore les evenements Transloco qui ne sont pas un chargement', async () => {
    const { events$, service } = serviceWithEvents();
    const before = service.revision();

    events$.next({ type: 'langChanged' });
    await Promise.resolve();

    expect(service.revision()).toBe(before);
  });

  it('change aussi a la bascule de langue', () => {
    const { service } = serviceWithEvents();
    const before = service.revision();

    service.set('nl');

    expect(service.revision()).not.toBe(before);
  });
});
