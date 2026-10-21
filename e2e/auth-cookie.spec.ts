import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { BrowserContext, expect, Page, request as apiRequest, test } from '@playwright/test';

// HttpOnly refresh cookie, end to end against the real backend (same one the
// vote cycle uses). The refresh token must never be readable by script; the
// access token lives in memory, so a reload restores the session through the
// cookie. FACILITATION_SERVER_DIR / FACILITATION_PYTHON point at another backend checkout.

const SERVER_DIR = process.env['FACILITATION_SERVER_DIR'] ?? path.resolve('../../PycharmProjects/Facilitation_server');
const PYTHON = process.env['FACILITATION_PYTHON'] ?? path.join(SERVER_DIR, '.venv/Scripts/python.exe');
const API = 'http://localhost:8000';
const COOKIE = 'facilitation_refresh';
const PASSWORD = 'sup3rSecret!e2e';

// Security tests: never retried. A failure here is a finding, not a flake — a
// retry would hide an intermittent auth bug (playwright.config.ts retries the
// rest of the suite once on CI).
test.describe.configure({ retries: 0 });

function createConfirmedUser(): string {
  const email = `e2e-cookie-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  execFileSync(
    PYTHON,
    [
      'manage.py',
      'shell',
      '-c',
      `from accounts.models import User; User.objects.create_user(email='${email}', password='${PASSWORD}', email_confirmed=True, display_name='E2E')`,
    ],
    { cwd: SERVER_DIR, stdio: 'pipe' },
  );
  return email;
}

async function englishContext(browser: BrowserContext['browser']): Promise<BrowserContext> {
  const ctx = await browser!.newContext();
  await ctx.addInitScript(() => localStorage.setItem('poker.lang', 'en'));
  return ctx;
}

async function refreshCookie(ctx: BrowserContext) {
  return (await ctx.cookies(`${API}/api/v1/auth/`)).find((c) => c.name === COOKIE);
}

/** Every storage entry, to prove no token is kept there. */
async function storageDump(page: Page): Promise<string> {
  return page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /Sign in/ }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/**
 * Load /me as a fresh page (memory is gone: the session must come back through
 * the cookie) and wait until the restore has finished.
 *
 * Never call this right after `page.reload()`: the reloaded page starts its own
 * boot-time refresh, the goto aborts it, and when the server already rotated the
 * cookie's token (blacklisting the old one) the browser drops the Set-Cookie of
 * the aborted response. The next load then presents a blacklisted token and is
 * signed out (CI flake of 2026-10-21). `goto` is itself the reload.
 *
 * Sign out first, URL second: the URL reads /me as soon as the document loads,
 * before the guard (which runs after the restore) has decided anything.
 */
async function expectSignedIn(page: Page): Promise<void> {
  await page.goto('/me');
  await expect(page.getByRole('button', { name: /Sign out/ })).toBeVisible();
  await expect(page).toHaveURL(/\/me$/);
}

test('login stores the refresh token in an HttpOnly cookie only, and a reload restores the session', async ({ browser }) => {
  const email = createConfirmedUser();
  const ctx = await englishContext(browser);
  const page = await ctx.newPage();

  await signIn(page, email);

  const cookie = await refreshCookie(ctx);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(cookie?.path).toBe('/api/v1/auth/');
  expect(await page.evaluate(() => document.cookie)).not.toContain(COOKIE);
  const dump = await storageDump(page);
  expect(dump).not.toContain(cookie!.value);
  expect(dump).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/); // no JWT at all
  expect(dump).toContain('facilitation.session');

  // New page load: memory is gone, the cookie brings the session back (and rotates).
  await expectSignedIn(page);
  expect((await refreshCookie(ctx))?.value).not.toBe(cookie!.value);
  await ctx.close();
});

test('a legacy refresh token left in localStorage is migrated once to the cookie, then deleted', async ({ browser }) => {
  const email = createConfirmedUser();
  // The pre-cookie SPA: body tokens, stored in localStorage.
  const api = await apiRequest.newContext();
  const login = await api.post(`${API}/api/v1/auth/login/`, { data: { email, password: PASSWORD } });
  expect(login.ok()).toBe(true);
  const { access, refresh } = await login.json();
  await api.dispose();

  const ctx = await englishContext(browser);
  const page = await ctx.newPage();
  await page.goto('/home');
  await page.evaluate(
    ([a, r]) => {
      localStorage.setItem('poker.access', a);
      localStorage.setItem('poker.refresh', r);
    },
    [access, refresh],
  );

  // New page load: the boot-time restore presents the legacy token once.
  await expectSignedIn(page);
  expect(await page.evaluate(() => [localStorage.getItem('poker.access'), localStorage.getItem('poker.refresh')])).toEqual([
    null,
    null,
  ]);
  expect((await refreshCookie(ctx))?.httpOnly).toBe(true);

  // The next load uses the cookie alone.
  await expectSignedIn(page);
  await ctx.close();
});

test('logout clears the cookie and the other tab follows', async ({ browser }) => {
  const email = createConfirmedUser();
  const ctx = await englishContext(browser);
  const page = await ctx.newPage();
  await signIn(page, email);
  const other = await ctx.newPage();
  await expectSignedIn(other);

  await expectSignedIn(page);
  await page.getByRole('button', { name: /Sign out/ }).click();
  await page.waitForURL(/\/home$/);

  expect(await refreshCookie(ctx)).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem('facilitation.session'))).toBeNull();
  // The other tab dropped its in-memory session: a guarded route sends it to /login.
  await other.getByRole('button', { name: /Sign out/ }).waitFor({ state: 'detached' });
  await other.goto('/me');
  await expect(other).toHaveURL(/\/login/);
  await ctx.close();
});
