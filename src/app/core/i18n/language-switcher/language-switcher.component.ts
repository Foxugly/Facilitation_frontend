import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { TooltipModule } from 'primeng/tooltip';

import { LanguageService } from '../language.service';
import { AVAILABLE_LANGS, AppLang, LANG_LABELS } from '../available-languages';

/**
 * Accessible language switcher (fleet standard §5, réf TrainingManager /
 * FoxRunner) : trigger showing the active 2-letter code + a keyboard-navigable
 * popup (↓/↑/Home/End/Enter/Échap), one row per language with `pi pi-check` on
 * the active one. Replaces the raw `p-select`.
 */
@Component({
  selector: 'app-language-switcher',
  standalone: true,
  imports: [TooltipModule],
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
    '(keydown.arrowdown)': 'onArrowDown($event)',
    '(keydown.arrowup)': 'onArrowUp($event)',
    '(keydown.home)': 'onHome($event)',
    '(keydown.end)': 'onEnd($event)',
    '(keydown.enter)': 'onEnter($event)',
  },
})
export class LanguageSwitcherComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly languageService = inject(LanguageService);

  protected readonly languages = AVAILABLE_LANGS.map((code) => ({
    code,
    short: code.toUpperCase(),
    name: LANG_LABELS[code],
  }));
  protected readonly current = this.languageService.active;
  /** Native name of the active language — shown as the trigger tooltip. */
  protected readonly currentName = computed(
    () => LANG_LABELS[this.current()] ?? '',
  );
  protected readonly open = signal(false);
  protected readonly focusedIndex = signal<number | null>(null);

  private readonly menuItems = viewChildren<ElementRef<HTMLButtonElement>>('menuitem');

  protected toggle(): void {
    const willOpen = !this.open();
    this.open.set(willOpen);
    if (willOpen) {
      const idx = this.languages.findIndex((l) => l.code === this.current());
      this.focusedIndex.set(idx >= 0 ? idx : 0);
      queueMicrotask(() => this.focusCurrent());
    } else {
      this.focusedIndex.set(null);
    }
  }

  protected close(): void {
    this.open.set(false);
    this.focusedIndex.set(null);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const root = this.elementRef.nativeElement;
    if (!root.contains(event.target as Node)) {
      this.close();
    }
  }

  protected select(code: AppLang): void {
    this.close();
    if (code === this.current()) return;
    this.languageService.set(code);
  }

  protected onArrowDown(event: Event): void {
    if (!this.open()) return;
    event.preventDefault();
    this.moveFocus('down');
  }

  protected onArrowUp(event: Event): void {
    if (!this.open()) return;
    event.preventDefault();
    this.moveFocus('up');
  }

  protected onHome(event: Event): void {
    if (!this.open()) return;
    event.preventDefault();
    this.focusedIndex.set(0);
    this.focusCurrent();
  }

  protected onEnd(event: Event): void {
    if (!this.open()) return;
    event.preventDefault();
    this.focusedIndex.set(this.languages.length - 1);
    this.focusCurrent();
  }

  protected onEnter(event: Event): void {
    if (!this.open()) return;
    const idx = this.focusedIndex();
    if (idx === null) return;
    event.preventDefault();
    this.select(this.languages[idx].code);
  }

  private moveFocus(direction: 'up' | 'down'): void {
    const len = this.languages.length;
    const current = this.focusedIndex() ?? 0;
    const next = direction === 'down' ? (current + 1) % len : (current - 1 + len) % len;
    this.focusedIndex.set(next);
    this.focusCurrent();
  }

  private focusCurrent(): void {
    const idx = this.focusedIndex();
    if (idx === null) return;
    this.menuItems()[idx]?.nativeElement.focus();
  }
}
