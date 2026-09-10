// Single source of truth for the supported languages (scope §10). Adding a language
// = one entry here + one catalog in public/i18n — no code change elsewhere.
export const AVAILABLE_LANGS = ['fr', 'nl', 'en', 'it', 'es'] as const;
export type AppLang = (typeof AVAILABLE_LANGS)[number];

export const DEFAULT_LANG: AppLang = 'fr';
export const FALLBACK_LANG: AppLang = 'en';

export const LANG_LABELS: Record<AppLang, string> = {
  fr: 'Français',
  nl: 'Nederlands',
  en: 'English',
  it: 'Italiano',
  es: 'Español',
};
