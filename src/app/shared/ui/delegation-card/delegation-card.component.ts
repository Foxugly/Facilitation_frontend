import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { FALLBACK_LANG } from '../../../core/i18n/available-languages';
import { SnapshotCard, TextLayer } from '../../../core/realtime/protocol';
import { CardIconComponent } from '../card-icon/card-icon.component';

interface PositionedLayer {
  style: Record<string, string>;
  text: string;
  /** URL du pictogramme, sur une couche `icon` qui en porte une. */
  icon: string | null;
}

/**
 * Renders ONE delegation card: background image + N text layers overlaid in CSS
 * (no server-side engraving, scope §8). Text follows the viewer's language with an
 * EN fallback. The card back is shown when face-down (before reveal).
 */
@Component({
  selector: 'app-delegation-card',
  standalone: true,
  imports: [CardIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="card-face"
      [class.selected]="selected()"
      [class.disabled]="disabled()"
      [disabled]="disabled()"
      [style.background-image]="backgroundUrl()"
      [style.background-color]="baseColor()"
    >
      @if (faceUp()) {
        @for (layer of layers(); track layer.style['top'] + layer.text + (layer.icon ?? '')) {
          @if (layer.icon) {
            <app-card-icon class="layer" [style]="layer.style" [src]="layer.icon" />
          } @else if (layer.text) {
            <span class="layer" [style]="layer.style">{{ layer.text }}</span>
          }
        }
      }
    </button>
  `,
  styles: [
    `
      .card-face {
        position: relative;
        width: 100%;
        aspect-ratio: 5 / 7;
        border-radius: var(--radius);
        border: 2px solid var(--border);
        background-size: cover;
        background-position: center;
        /* Dark base so the white overlay text stays legible before/without artwork
           (a missing OR broken image falls back to this); real art covers it. */
        background-color: #143d2f;
        box-shadow: var(--shadow-card);
        cursor: pointer;
        transition: transform 0.12s ease, border-color 0.12s ease;
        overflow: hidden;
        /* Establish a size container so layer font-size (cqh) scales with the card. */
        container-type: size;
      }
      .card-face:hover:not(.disabled) {
        transform: translateY(-4px);
      }
      .card-face.selected {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 40%, transparent);
      }
      .card-face.disabled {
        opacity: 0.65;
        cursor: default;
      }
      .layer {
        position: absolute;
        transform: translate(-50%, -50%);
        white-space: nowrap;
        line-height: 1;
        /* Modern, clean type for the card text — the same family as the app UI,
           overriding whatever font the deck snapshot carries. */
        font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        letter-spacing: 0.01em;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
      }
    `,
  ],
})
export class DelegationCardComponent {
  readonly card = input.required<SnapshotCard>();
  readonly selected = input(false);
  readonly revealed = input(true);
  readonly disabled = input(false);
  readonly lang = input(FALLBACK_LANG as string);
  readonly cardBack = input<string | null>(null);
  readonly cardBackColor = input<string | null>(null);

  readonly faceUp = computed(() => this.revealed());

  /** Face-down cards take the (team-customizable) card-back colour; face-up keep the
   * dark base so overlay text stays legible before/without artwork. */
  readonly baseColor = computed(() => (this.faceUp() ? '#143d2f' : this.cardBackColor() || '#143d2f'));

  readonly backgroundUrl = computed(() => {
    const url = this.faceUp() ? this.card().background.image : this.cardBack();
    return url ? `url('${url}')` : 'none';
  });

  readonly layers = computed<PositionedLayer[]>(() =>
    [...this.card().layers]
      .sort((a, b) => a.order - b.order)
      .map((layer) => {
        const isIcon = layer.kind === 'icon';
        return {
          icon: this.resolveIcon(layer),
          // Une couche icon n'a jamais de texte de repli : sa cle n'est pas de la prose,
          // l'afficher telle quelle sur une carte serait pire que de ne rien afficher.
          text: isIcon ? '' : this.resolveText(layer),
          style: this.styleFor(layer, isIcon),
        };
      }),
  );

  /** Une couche `icon` porte l'URL de son pictogramme. Une couche icon sans image —
   * referentiel incomplet — est ignoree : mieux vaut une carte nue qu'un trou visuel. */
  private resolveIcon(layer: TextLayer): string | null {
    return layer.kind === 'icon' ? layer.icon || null : null;
  }

  private resolveText(layer: TextLayer): string {
    if (typeof layer.text === 'string') return layer.text;
    return layer.text[this.lang()] ?? layer.text[FALLBACK_LANG] ?? Object.values(layer.text)[0] ?? '';
  }

  private styleFor(layer: TextLayer, isIcon: boolean): Record<string, string> {
    const base: Record<string, string> = {
      left: `${layer.x}%`,
      top: `${layer.y}%`,
      color: layer.color,
    };
    if (isIcon) {
      // Une icone se dimensionne en boite, pas en corps de texte — mais toujours en
      // cqh, donc elle suit la taille de la carte exactement comme le fait le texte.
      return { ...base, width: `${layer.size}cqh`, height: `${layer.size}cqh` };
    }
    return {
      ...base,
      // font-size in % of card height (cqh); container-query unit keeps it responsive.
      'font-size': `${layer.size}cqh`,
      'font-weight': String(layer.weight),
      'text-align': layer.align,
    };
  }
}
