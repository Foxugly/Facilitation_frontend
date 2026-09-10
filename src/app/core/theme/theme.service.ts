import { Injectable, signal } from '@angular/core';

const THEME_KEY = 'theme';
type Theme = 'light' | 'dark';

/** Dark/light toggle. Adds `.dark-mode` on <html> (PrimeNG darkModeSelector). */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('light');

  init(): void {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    this.apply(stored ?? (prefersDark ? 'dark' : 'light'));
  }

  toggle(): void {
    this.apply(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private apply(theme: Theme): void {
    this.theme.set(theme);
    document.documentElement.classList.toggle('dark-mode', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
  }
}
