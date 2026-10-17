import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import { passwordsMatch } from './passwords-match';

function group(password: string, confirm: string) {
  return new FormGroup(
    { password: new FormControl(password), confirm: new FormControl(confirm) },
    { validators: [passwordsMatch('password', 'confirm')] },
  );
}

describe('passwordsMatch', () => {
  it('valide quand les deux champs sont identiques', () => {
    expect(group('abcdefgh', 'abcdefgh').errors).toBeNull();
  });

  it('pose mismatch quand ils diffèrent', () => {
    expect(group('abcdefgh', 'abcdefgX').errors).toEqual({ mismatch: true });
  });

  it('ignore une confirmation encore vide', () => {
    expect(group('abcdefgh', '').errors).toBeNull();
  });

  it('se réévalue quand un champ change', () => {
    const g = group('abcdefgh', 'abcdefgh');
    g.controls.confirm.setValue('autre');
    expect(g.errors).toEqual({ mismatch: true });
    g.controls.password.setValue('autre');
    expect(g.errors).toBeNull();
  });
});
