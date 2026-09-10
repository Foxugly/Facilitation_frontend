import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CardIconComponent } from './card-icon.component';

@Component({
  standalone: true,
  imports: [CardIconComponent],
  template: `<app-card-icon [src]="src" />`,
})
class HostComponent {
  src = 'https://poker-api.example/media/decks/icons/fist-3.png';
}

describe('CardIconComponent', () => {
  function render(src: string): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.src = src;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('paints the icon as a mask, never as an image element', () => {
    // Les dessins sont noirs sur fond transparent : affiches tels quels ils seraient
    // invisibles sur une carte sombre et insensibles au theme d'equipe. Seul le masque
    // rempli en currentColor tient les deux promesses.
    const el = render('https://poker-api.example/media/decks/icons/fist-3.png');
    expect(el.querySelector('img')).toBeNull();
    const mask = el.querySelector('span.mask') as HTMLElement;
    expect(mask).not.toBeNull();
    expect(mask.style.getPropertyValue('--icon')).toContain('decks/icons/fist-3.png');
  });

  it('renders whatever url the referential serves', () => {
    // Aucune liste de cles en dur : un pictogramme ajoute en admin doit s'afficher
    // sans toucher a ce depot. C'est tout l'objet de ce composant.
    const el = render('https://poker-api.example/media/decks/icons/tout-nouveau.png');
    const mask = el.querySelector('span.mask') as HTMLElement;
    expect(mask.style.getPropertyValue('--icon')).toContain('tout-nouveau.png');
  });

  it('escapes a single quote in the url so the css declaration survives', () => {
    const el = render("https://poker-api.example/media/decks/icons/l'ete.png");
    const mask = el.querySelector('span.mask') as HTMLElement;
    expect(mask.style.getPropertyValue('--icon')).toContain("l\\'ete.png");
  });
});
