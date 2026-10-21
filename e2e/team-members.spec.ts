import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Decision produit du 2026-10-21 : un membre voit le NOM de ses coequipiers,
 * jamais leur e-mail. Le serveur ne l'envoie qu'aux gestionnaires de l'equipe
 * (owner + manager) et pour la propre ligne du membre ; l'onglet Membres
 * n'affiche l'adresse que si elle est la.
 */

async function openMembers(browser: Parameters<typeof signIn>[0], email: string) {
  const { ctx, page } = await signIn(browser, email);
  await page.goto('/teams');
  await page.getByText('E2E Team').click();
  await page.waitForURL(/\/teams\/\d+/);
  const rows = page.locator('.member-row');
  await expect(rows.first()).toBeVisible();
  return { ctx, page, rows };
}

test('le proprietaire voit les e-mails de ses membres', async ({ browser }) => {
  const { ctx, rows } = await openMembers(browser, 'e2e@example.com');
  await expect(rows.filter({ hasText: 'Alex' }).locator('.email')).toHaveText('e2e-member@example.com');
  await ctx.close();
});

test('un membre voit les noms, pas les e-mails des autres', async ({ browser }) => {
  const { ctx, page, rows } = await openMembers(browser, 'e2e-member@example.com');
  const owner = rows.filter({ hasText: 'E2E' }).filter({ hasNotText: 'Alex' });
  await expect(owner.locator('.name')).toHaveText('E2E');
  await expect(owner.locator('.email')).toHaveCount(0);
  // Sa propre adresse reste visible.
  await expect(rows.filter({ hasText: 'Alex' }).locator('.email')).toHaveText('e2e-member@example.com');
  await expect(page.getByText('e2e@example.com', { exact: true })).toHaveCount(0);
  await ctx.close();
});
