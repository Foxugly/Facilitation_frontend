import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTranslocoScope, TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { describe, expect, it, vi } from 'vitest';

import fr from '../../../../public/i18n/fr.json';
import { AuthService } from '../../core/auth/auth.service';
import { DeleteAccountComponent } from './delete-account.component';

function setup(deleteAccount: (pw: string) => Promise<void>, exportData: () => Promise<void> = () => Promise.resolve()) {
  const messages = { add: vi.fn() };
  TestBed.configureTestingModule({
    imports: [
      DeleteAccountComponent,
      TranslocoTestingModule.forRoot({ langs: { fr }, translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' } }),
    ],
    providers: [
      provideRouter([]),
      provideTranslocoScope({ scope: '' }),
      { provide: MessageService, useValue: messages },
      { provide: AuthService, useValue: { deleteAccount: vi.fn(deleteAccount), exportData: vi.fn(exportData) } },
    ],
  });
  const fixture = TestBed.createComponent(DeleteAccountComponent);
  fixture.detectChanges();
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  return { cmp: fixture.componentInstance, auth: TestBed.inject(AuthService), messages, navigate };
}

const httpError = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

describe('DeleteAccountComponent', () => {
  it('asks for the password before calling the API', async () => {
    const { cmp, auth } = setup(() => Promise.resolve());
    await cmp.submit();
    expect(auth.deleteAccount).not.toHaveBeenCalled();
    expect(cmp.error()).toBe(fr.me.delete.password_required);
  });

  it('on success leaves for /home with a toast', async () => {
    const { cmp, auth, messages, navigate } = setup(() => Promise.resolve());
    cmp.password.set('pw');
    await cmp.submit();
    expect(auth.deleteAccount).toHaveBeenCalledWith('pw');
    expect(navigate).toHaveBeenCalledWith(['/home']);
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success', summary: fr.me.delete.success }));
  });

  it.each([
    [httpError(400, { code: 'current_password_invalid' }), fr.me.delete.password_invalid],
    [httpError(400, { detail: ['Current password is incorrect.'] }), fr.me.delete.password_invalid],
    [httpError(409, { code: 'owns_teams' }), fr.me.delete.owns_teams],
    [httpError(429), fr.me.delete.throttled],
    [httpError(500), fr.auth.errors.generic],
  ])('maps the error to a message and keeps the dialog open (%#)', async (err, expected) => {
    const { cmp, navigate } = setup(() => Promise.reject(err));
    cmp.password.set('pw');
    await cmp.submit();
    expect(cmp.error()).toBe(expected);
    expect(cmp.pending()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('exports the data without opening the dialog', async () => {
    const { cmp, auth, messages } = setup(() => Promise.resolve());
    await cmp.exportData();
    expect(auth.exportData).toHaveBeenCalledTimes(1);
    expect(auth.deleteAccount).not.toHaveBeenCalled();
    expect(messages.add).not.toHaveBeenCalled();
    expect(cmp.exporting()).toBe(false);
  });

  it.each([
    [httpError(429), fr.me.export.throttled],
    [httpError(500), fr.me.export.failed],
  ])('shows a toast when the export fails (%#)', async (err, expected) => {
    const { cmp, messages } = setup(() => Promise.resolve(), () => Promise.reject(err));
    await cmp.exportData();
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', summary: expected }));
    expect(cmp.exporting()).toBe(false);
  });
});
