import { describe, expect, it } from 'vitest';

import en from '../../public/i18n/en.json';
import es from '../../public/i18n/es.json';
import fr from '../../public/i18n/fr.json';
import itIT from '../../public/i18n/it.json';
import nl from '../../public/i18n/nl.json';

// fr is the source of truth (§3.15). Every other catalog must carry the exact
// same key set — adding a language is data, but the keys must stay in parity.
function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe('i18n parity', () => {
  const source = flatKeys(fr).sort();
  const catalogs: Record<string, Record<string, unknown>> = { nl, en, it: itIT, es };

  for (const [lang, catalog] of Object.entries(catalogs)) {
    it(`${lang} has the same keys as fr`, () => {
      expect(flatKeys(catalog).sort()).toEqual(source);
    });
  }
});
