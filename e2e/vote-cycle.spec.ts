import { BrowserContext, expect, Page, test } from '@playwright/test';

// Two isolated participants (separate contexts = separate localStorage identities)
// run a full Delegation Poker round end to end: create → join → subject → open →
// vote → live participation → reveal → act. Locale is forced to EN for stable text.

async function englishContext(browser: BrowserContext['browser']): Promise<BrowserContext> {
  const ctx = await browser!.newContext();
  await ctx.addInitScript(() => localStorage.setItem('poker.lang', 'en'));
  return ctx;
}

test('two participants run a full vote cycle', async ({ browser }) => {
  const facCtx = await englishContext(browser);
  const voterCtx = await englishContext(browser);
  const fac: Page = await facCtx.newPage();
  const voter: Page = await voterCtx.newPage();

  // --- Facilitator creates a room ---
  await fac.goto('/');
  await fac.getByRole('textbox').nth(1).fill('Sam'); // 1st = title (optional), 2nd = username
  await fac.getByRole('button', { name: /Create/ }).click();
  await fac.waitForURL(/\/room\/[A-Z0-9]{6,8}/);
  const code = fac.url().split('/room/')[1];
  expect(code).toMatch(/^[A-Z0-9]{6,8}$/);

  // --- Voter joins via the direct URL (username only) ---
  await voter.goto(`/join/${code}`);
  await voter.getByRole('textbox').first().fill('Alex');
  // Button accessible names carry a leading space from the icon node — match loosely.
  await voter.getByRole('button', { name: /Join/ }).click();
  await voter.waitForURL(/\/room\//);

  // Facilitator sees the second participant appear live.
  await expect(fac.getByText('Alex')).toBeVisible();

  // --- Facilitator sets the subject and opens the vote ---
  await fac.getByRole('textbox').first().fill('Who owns the budget?');
  await fac.getByRole('button', { name: /Save/ }).click();
  await fac.getByRole('button', { name: /Open vote/ }).click();

  // --- Voter casts card 5 (Advise) ---
  await voter.getByRole('button', { name: /Advise/ }).click();

  // Facilitator sees live participation reach 1 voted, then reveals.
  await expect(fac.getByText(/1 \/ \d/)).toBeVisible();
  await fac.getByRole('button', { name: /Reveal/ }).click();

  // Revealed → the facilitator can now set the result (default = mode).
  const setResult = fac.getByRole('button', { name: /Set result/ });
  await expect(setResult).toBeVisible();
  await setResult.click();

  // Acted: the chosen level is displayed.
  await expect(fac.getByText(/Result set/)).toBeVisible();
  await expect(fac.getByText(/Chosen level/)).toBeVisible();

  await facCtx.close();
  await voterCtx.close();
});
