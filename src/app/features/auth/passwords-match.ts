import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validateur de groupe : pose l'erreur `mismatch` quand les deux champs diffèrent.
 * N'émet rien tant que la confirmation est vide (le `required` du champ s'en charge).
 */
export function passwordsMatch(passwordKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey)?.value as string | null | undefined;
    const confirm = group.get(confirmKey)?.value as string | null | undefined;
    if (!confirm) return null;
    return password === confirm ? null : { mismatch: true };
  };
}
