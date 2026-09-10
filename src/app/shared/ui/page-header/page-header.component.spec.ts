import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PageHeaderComponent } from './page-header.component';

/**
 * Guards the projection contract of app-page-header. Content without a `slot`
 * attribute matches no <ng-content> and is silently dropped — the bug that hid
 * the board page's Back / export buttons. Also pins down whether a `slot=` set
 * on an element *inside* an @if block still reaches its named slot.
 */
@Component({
  standalone: true,
  imports: [PageHeaderComponent],
  template: `
    <app-page-header title="T">
      <button slot="left" id="back">back</button>
      <button id="orphan">orphan</button>
      @if (show) {
        <button slot="right" id="in-if">in-if</button>
      }
      <span slot="right" id="wrapped">
        @if (show) {
          <button id="in-wrapper">in-wrapper</button>
        }
      </span>
    </app-page-header>
  `,
})
class HostComponent {
  show = true;
}

describe('PageHeaderComponent projection', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('projects a slot=left child into the left column', () => {
    expect(render().querySelector('.page-header__side--left #back')).not.toBeNull();
  });

  it('drops a child that carries no slot attribute', () => {
    expect(render().querySelector('#orphan')).toBeNull();
  });

  it('projects a slot=right element wrapped in a container', () => {
    expect(render().querySelector('.page-header__side--right #in-wrapper')).not.toBeNull();
  });

  it('projects a slot=right element declared directly inside an @if block', () => {
    expect(render().querySelector('.page-header__side--right #in-if')).not.toBeNull();
  });
});
