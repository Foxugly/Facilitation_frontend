import { Browser, BrowserContext, expect, Page } from '@playwright/test';

/**
 * Fabriques partagees par les specs e2e.
 *
 * Chaque participant a son PROPRE contexte navigateur : l'identite d'une salle
 * tient dans le localStorage (token participant), donc deux onglets d'un meme
 * contexte seraient la meme personne. La langue est forcee en anglais pour que
 * les libelles attendus soient stables.
 */

export async function englishContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem('poker.lang', 'en'));
  return ctx;
}

/** Cree une salle et rend le code + la page du facilitateur. */
export async function createRoom(browser: Browser, name = 'Sam'): Promise<{
  ctx: BrowserContext;
  page: Page;
  code: string;
}> {
  const ctx = await englishContext(browser);
  const page = await ctx.newPage();
  await page.goto('/');
  // 1er champ = titre de salle (facultatif), 2e = nom d'affichage.
  await page.getByRole('textbox').nth(1).fill(name);
  await page.getByRole('button', { name: /Create/ }).click();
  await page.waitForURL(/\/room\/[A-Z0-9]{6,8}/);
  const code = page.url().split('/room/')[1];
  expect(code).toMatch(/^[A-Z0-9]{6,8}$/);
  return { ctx, page, code };
}

/** Fait entrer un participant supplementaire dans une salle existante. */
export async function joinRoom(browser: Browser, code: string, name: string): Promise<{
  ctx: BrowserContext;
  page: Page;
}> {
  const ctx = await englishContext(browser);
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByRole('textbox').first().fill(name);
  await page.getByRole('button', { name: /Join/ }).click();
  await page.waitForURL(/\/room\//);
  return { ctx, page };
}

/**
 * Compose un round puis l'ouvre.
 *
 * Le panneau du facilitateur se joue en DEUX temps depuis la refonte : on saisit
 * le sujet et les reglages, on « prepare » (le round est annonce a tous), puis on
 * « lance » (les votes s'ouvrent). Un seul bouton « Save » ne suffit plus.
 */
export async function openRound(fac: Page, subject: string): Promise<void> {
  await fac.locator('#subjectDraft').fill(subject);
  await fac.getByRole('button', { name: /Prepare the vote/ }).click();
  await fac.getByRole('button', { name: /Launch the vote/ }).click();
}

/**
 * Ouvre une salle D'EQUIPE, seule a donner acces au timer, a la revelation
 * anonyme et au choix du deck.
 *
 * Le compte et l'equipe sont fabriques par `manage.py seed_e2e_team` cote
 * backend, joue au demarrage par playwright.config.ts. Les creer depuis l'UI
 * supposerait une inscription, une confirmation par e-mail et un paiement :
 * hors de portee d'un test de bout en bout.
 */
export async function signIn(browser: Browser, email: string): Promise<{
  ctx: BrowserContext;
  page: Page;
}> {
  const ctx = await englishContext(browser);
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByRole('textbox').first().fill(email);
  await page.locator('input[type="password"]').fill('e2e-password-1234');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return { ctx, page };
}

/**
 * Fait entrer un MEMBRE connecte dans une salle d'equipe.
 *
 * `joinRoom` ne convient pas ici : une salle d'equipe est reservee a ses membres
 * et repond « Sign in to join this team session » a un visiteur anonyme.
 */
export async function joinTeamRoom(browser: Browser, code: string): Promise<{
  ctx: BrowserContext;
  page: Page;
}> {
  const { ctx, page } = await signIn(browser, 'e2e-member@example.com');
  await page.goto(`/join/${code}`);
  // Le nom d'affichage reste obligatoire meme connecte : JoinComponent le lit
  // dans IdentityService (stockage local), vide dans un contexte neuf, et
  // `join()` sort sans rien faire si le champ est vide — sans message d'erreur.
  await page.getByRole('textbox').first().fill('Alex');
  await page.getByRole('button', { name: /Join/ }).click();
  await page.waitForURL(/\/room\//);
  return { ctx, page };
}

export async function openTeamRoom(browser: Browser): Promise<{
  ctx: BrowserContext;
  page: Page;
  code: string;
}> {
  const { ctx, page } = await signIn(browser, 'e2e@example.com');

  await page.goto('/teams');
  await page.getByText('E2E Team').click();
  await page.waitForURL(/\/teams\/\d+/);

  await page.getByRole('button', { name: /New session/ }).click();
  await page.waitForURL(/\/room\/[A-Z0-9]{6,8}/);
  const code = page.url().split('/room/')[1];
  return { ctx, page, code };
}

/** Attend que la salle affiche l'etat demande (badge d'etat). */
export async function expectState(page: Page, label: 'Waiting' | 'Vote open' | 'Revealed' | 'Result set'): Promise<void> {
  await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
}
