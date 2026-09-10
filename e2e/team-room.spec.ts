import { expect, test } from '@playwright/test';
import { expectState, joinTeamRoom, openTeamRoom } from './helpers';

/**
 * Fonctions reservees aux equipes payantes : timer de round, revelation
 * anonyme, choix du deck.
 *
 * Une salle anonyme ne les propose pas — le timer est masque par
 * `@if (socket.isTeam())`, l'anonymat par `canAnonymise`, et le catalogue se
 * reduit au sous-ensemble gratuit, donc sans choix a faire. Ces trois reglages
 * se posent dans le MEME formulaire de composition et sont figes a l'ouverture
 * du round : ils forment un bloc, que l'extraction du poker en « activite »
 * devra deplacer d'un seul tenant.
 */

test('une salle d equipe expose timer, anonymat et choix du deck', async ({ browser }) => {
  const { ctx, page: fac } = await openTeamRoom(browser);

  // Le formulaire de composition porte les trois reglages.
  await expect(fac.locator('#subjectDraft')).toBeVisible();
  await expect(fac.locator('.timer-settings')).toBeVisible();
  await expect(fac.locator('.reveal-settings')).toBeVisible();
  // seed_e2e_team active tout le catalogue : le selecteur de deck est donc offert.
  await expect(fac.locator('.deck-settings')).toBeVisible();

  await ctx.close();
});

test('une salle anonyme n offre ni timer ni anonymat', async ({ browser }) => {
  // Contre-epreuve du test precedent : sans equipe, les memes blocs disparaissent.
  const { createRoom } = await import('./helpers');
  const { ctx, page: fac } = await createRoom(browser, 'Sam');

  await expect(fac.locator('#subjectDraft')).toBeVisible();
  await expect(fac.locator('.timer-settings')).toHaveCount(0);
  await expect(fac.locator('.reveal-settings')).toHaveCount(0);

  await ctx.close();
});

test('le timer arme une echeance annoncee a tous les participants', async ({ browser }) => {
  const { ctx: facCtx, page: fac, code } = await openTeamRoom(browser);
  const { ctx: voterCtx, page: voter } = await joinTeamRoom(browser, code);

  // Activation du timer dans le formulaire de composition (10 s = le minimum
  // accepte par le serveur, qui borne et normalise la valeur).
  await fac.locator('.timer-settings p-toggleswitch').click();
  await fac.locator('#subjectDraft').fill('Timed round');
  await fac.getByRole('button', { name: /Prepare the vote/ }).click();
  await fac.getByRole('button', { name: /Launch the vote/ }).click();

  // Le decompte s'affiche des l'ouverture, chez le facilitateur ET chez le votant :
  // l'echeance est diffusee, elle n'est pas calculee localement. Le compte a
  // rebours du client reste cosmetique — le serveur fait autorite.
  await expect(fac.locator('.timer-badge')).toBeVisible();
  await expect(voter.locator('.timer-badge')).toBeVisible();
  await expect(voter.locator('.timer-badge')).toContainText(/\d+s/);

  await facCtx.close();
  await voterCtx.close();
});

test('la revelation anonyme masque le lien participant -> carte', async ({ browser }) => {
  const { ctx: facCtx, page: fac, code } = await openTeamRoom(browser);
  const { ctx: voterCtx, page: voter } = await joinTeamRoom(browser, code);

  // Bascule en anonyme AVANT d'ouvrir : le mode est fige a l'ouverture, et les
  // votants doivent le connaitre avant de jouer.
  await fac.locator('.reveal-settings p-toggleswitch').click();
  await fac.locator('#subjectDraft').fill('Anonymous round');
  await fac.getByRole('button', { name: /Prepare the vote/ }).click();

  // Le mode est annonce a tous, y compris aux votants.
  await expect(voter.getByText(/Anonymous/i).first()).toBeVisible();

  await fac.getByRole('button', { name: /Launch the vote/ }).click();
  await voter.getByRole('button', { name: /Delegate/ }).click();
  await expect(fac.getByText(/1 \/ \d/)).toBeVisible();

  await fac.getByRole('button', { name: /Reveal/ }).click();
  await expectState(fac, 'Revealed');

  // Le decompte est bien la, mais le tapis ne rattache aucune carte a un nom :
  // en anonyme le serveur n'emet pas la cle `votes`, donc aucun siege ne se
  // retourne. C'est l'invariant, et il tient cote SERVEUR, pas a l'affichage.
  await expect(fac.getByText('Votes are anonymous')).toBeVisible();
  await expect(fac.locator('.felt').getByText('Delegate', { exact: true })).toHaveCount(0);

  await facCtx.close();
  await voterCtx.close();
});
