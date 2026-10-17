/**
 * Mappe une erreur HTTP de l'API d'authentification vers une clé i18n.
 *
 * Codes réellement renvoyés par le backend (`accounts/api_views.py`, corps
 * `{code, detail}`) : `captcha_failed` (400), `email_not_verified` (403),
 * `password_invalid` et `reset_link_invalid` (400). Le rate-limit DRF répond 429
 * sans code applicatif. Un identifiant refusé au login arrive en 400 (`Invalid
 * credentials.`). Le `detail` brut du backend n'est jamais affiché : il est en
 * anglais et non traduit.
 */
export interface AuthHttpError {
  status?: number;
  error?: { code?: string } | null;
}

export interface AuthErrorOptions {
  /** Clé utilisée pour un 400/401 sans code applicatif connu (ex. identifiants refusés au login). */
  badRequestKey?: string;
}

export function authErrorKey(e: unknown, options: AuthErrorOptions = {}): string {
  const err = (e ?? {}) as AuthHttpError;
  const code = err.error?.code;
  if (err.status === 429) return 'auth.errors.too_many';
  if (code === 'captcha_failed') return 'auth.errors.captcha';
  if (code === 'password_invalid') return 'auth.errors.password_invalid';
  if (code === 'reset_link_invalid') return 'auth.errors.reset_invalid';
  if ((err.status === 400 || err.status === 401) && options.badRequestKey) return options.badRequestKey;
  return 'auth.errors.generic';
}
