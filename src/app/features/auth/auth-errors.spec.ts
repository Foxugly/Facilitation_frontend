import { describe, expect, it } from 'vitest';

import { authErrorKey } from './auth-errors';

describe('authErrorKey', () => {
  it('429 -> trop de tentatives', () => {
    expect(authErrorKey({ status: 429, error: { detail: 'Request was throttled.' } })).toBe('auth.errors.too_many');
  });

  it('captcha_failed -> captcha', () => {
    expect(authErrorKey({ status: 400, error: { code: 'captcha_failed' } })).toBe('auth.errors.captcha');
  });

  it('password_invalid et reset_link_invalid -> messages dédiés', () => {
    expect(authErrorKey({ status: 400, error: { code: 'password_invalid' } })).toBe('auth.errors.password_invalid');
    expect(authErrorKey({ status: 400, error: { code: 'reset_link_invalid' } })).toBe('auth.errors.reset_invalid');
  });

  it('400/401 sans code -> badRequestKey si fournie', () => {
    const opts = { badRequestKey: 'auth.errors.invalid_credentials' };
    expect(authErrorKey({ status: 400, error: { detail: 'Invalid credentials.' } }, opts)).toBe('auth.errors.invalid_credentials');
    expect(authErrorKey({ status: 401 }, opts)).toBe('auth.errors.invalid_credentials');
  });

  it('400 sans badRequestKey, 5xx et réseau -> erreur générique', () => {
    expect(authErrorKey({ status: 400, error: {} })).toBe('auth.errors.generic');
    expect(authErrorKey({ status: 500 }, { badRequestKey: 'x' })).toBe('auth.errors.generic');
    expect(authErrorKey({ status: 0 }, { badRequestKey: 'x' })).toBe('auth.errors.generic');
    expect(authErrorKey(null)).toBe('auth.errors.generic');
  });

  it('le rate-limit prime sur la clé 400 du login', () => {
    expect(authErrorKey({ status: 429 }, { badRequestKey: 'auth.errors.invalid_credentials' })).toBe('auth.errors.too_many');
  });
});
