import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Le pictogramme d'une carte, peint comme **masque CSS rempli en `currentColor`** et
 * jamais comme <img>.
 *
 * Deux raisons, pas une. Les dessins fournis sont noirs sur fond transparent : affiches
 * tels quels ils seraient invisibles sur une carte sombre. Et un raster ne sait pas
 * heriter d'une couleur : sans le masque, la personnalisation par equipe cesserait de
 * fonctionner sur ces cartes. Le masque resout les deux — la forme vient de l'image via
 * son canal alpha, la couleur vient de la couche.
 *
 * L'URL vient du snapshot, donc du referentiel : **ajouter un pictogramme est un
 * televersement en admin, jamais une livraison de ce depot**. C'est la meme confiance et
 * le meme chemin que l'image de fond d'une carte, deja interpolee dans un style ici.
 */
@Component({
  selector: 'app-card-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="mask" [style.--icon]="cssUrl()" aria-hidden="true"></span>`,
  styles: [
    `
      :host {
        display: block;
        line-height: 0;
      }
      .mask {
        display: block;
        width: 100%;
        height: 100%;
        /* La couleur vient de la couche ; l'image ne fournit que la forme. */
        background-color: currentColor;
        -webkit-mask-image: var(--icon);
        mask-image: var(--icon);
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
        -webkit-mask-position: center;
        mask-position: center;
        -webkit-mask-size: contain;
        mask-size: contain;
      }
    `,
  ],
})
export class CardIconComponent {
  readonly src = input.required<string>();

  /** Les guillemets simples de l'URL sont echappes : une apostrophe dans un nom de
   * fichier televerse casserait sinon la declaration CSS. */
  readonly cssUrl = computed(() => `url('${this.src().replace(/'/g, "\\'")}')`);
}
