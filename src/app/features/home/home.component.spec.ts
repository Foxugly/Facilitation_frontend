import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslocoScope, TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { describe, expect, it, vi } from 'vitest';

import fr from '../../../../public/i18n/fr.json';
import { RoomApiService } from '../../core/api/room-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { IdentityService } from '../../core/identity/identity.service';
import { HomeComponent } from './home.component';

function setup(authenticated: boolean) {
  TestBed.configureTestingModule({
    imports: [
      HomeComponent,
      TranslocoTestingModule.forRoot({ langs: { fr }, translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' } }),
    ],
    providers: [
      provideRouter([]),
      provideTranslocoScope({ scope: '' }),
      { provide: MessageService, useValue: { add: vi.fn() } },
      { provide: RoomApiService, useValue: {} },
      { provide: IdentityService, useValue: { username: '' } },
      { provide: AuthService, useValue: { isAuthenticated: signal(authenticated) } },
    ],
  });
  const fixture = TestBed.createComponent(HomeComponent);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  return { el, cmp: fixture.componentInstance };
}

const text = (el: HTMLElement, sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent?.trim());

describe('HomeComponent hero', () => {
  it('has no eyebrow above the title', () => {
    const { el } = setup(false);
    expect(el.querySelector('.hero .eyebrow')).toBeNull();
    expect(el.querySelector('.hero h2')?.textContent).toContain(fr.home.title);
  });

  it('shows login, register and contact to an anonymous visitor', () => {
    const { el } = setup(false);
    const actions = el.querySelector('.hero__actions') as HTMLElement;
    expect(text(actions, 'p-button button')).toEqual([fr.home.login_cta, fr.home.register_cta]);
    expect(text(actions, '.hero__contact')).toEqual([fr.home.contact_cta]);
  });

  it('hides login and register once logged in, keeps contact', () => {
    const { el } = setup(true);
    const actions = el.querySelector('.hero__actions') as HTMLElement;
    expect(actions.querySelectorAll('p-button').length).toBe(0);
    expect(text(actions, '.hero__contact')).toEqual([fr.home.contact_cta]);
  });

  it('wires the contact button to the shared contact mail', () => {
    const { el, cmp } = setup(false);
    const contact = vi.spyOn(cmp, 'contactClick').mockImplementation(() => undefined);
    (el.querySelector('.hero__contact') as HTMLButtonElement).click();
    expect(contact).toHaveBeenCalledTimes(1);
  });
});
