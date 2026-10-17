import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { composeTitle, titleKeyOf } from './app-title.strategy';

function route(data: Record<string, unknown>, child: ActivatedRouteSnapshot | null = null): ActivatedRouteSnapshot {
  return { data, firstChild: child } as unknown as ActivatedRouteSnapshot;
}

describe('composeTitle', () => {
  it('compose « page — app »', () => {
    expect(composeTitle('Tarifs', 'Poker')).toBe('Tarifs — Poker');
  });

  it("n'affiche que le nom de l'app sans titre de page", () => {
    expect(composeTitle(null, 'Poker')).toBe('Poker');
  });
});

describe('titleKeyOf', () => {
  it('lit data.titleKey de la route enfant la plus profonde', () => {
    const snapshot = { root: route({}, route({}, route({ titleKey: 'pricing.title' }))) } as RouterStateSnapshot;
    expect(titleKeyOf(snapshot)).toBe('pricing.title');
  });

  it("préfère l'enfant au parent", () => {
    const snapshot = { root: route({ titleKey: 'a' }, route({ titleKey: 'b' })) } as RouterStateSnapshot;
    expect(titleKeyOf(snapshot)).toBe('b');
  });

  it('renvoie null quand aucune route ne déclare de titre', () => {
    const snapshot = { root: route({}, route({})) } as RouterStateSnapshot;
    expect(titleKeyOf(snapshot)).toBeNull();
  });
});
