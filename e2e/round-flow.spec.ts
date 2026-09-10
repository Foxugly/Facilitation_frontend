import { expect, test } from '@playwright/test';
import { createRoom, expectState, joinRoom, openRound } from './helpers';

/**
 * Parcours produit d'une salle : agenda de sujets et reprise d'un round.
 *
 * Contrairement aux invariants de protocole, ces scenarios passent par des
 * ecrans. Ils restent utiles pendant l'extraction du poker en « activite » :
 * l'agenda et la remise a zero sont pilotes par le serveur, pas par le seul
 * composant, et devront survivre au decoupage shell / activite.
 */

test("l'agenda accepte plusieurs sujets et bascule de l'un a l'autre", async ({ browser }) => {
  const { ctx: facCtx, page: fac, code } = await createRoom(browser, 'Sam');
  const { ctx: voterCtx, page: voter } = await joinRoom(browser, code, 'Alex');

  // La file est vide au depart.
  await expect(fac.getByText('No subjects yet. Add one to get started.')).toBeVisible();

  // Deux sujets empiles SANS lancer de round : « Add to queue » compose et met en
  // attente, la ou « Prepare the vote » annoncerait le round tout de suite.
  await fac.locator('#subjectDraft').fill('First topic');
  await fac.getByRole('button', { name: /Add to queue/ }).click();
  await fac.locator('#subjectDraft').fill('Second topic');
  await fac.getByRole('button', { name: /Add to queue/ }).click();

  const agenda = fac.locator('ul.agenda');
  await expect(agenda.getByText('First topic')).toBeVisible();
  await expect(agenda.getByText('Second topic')).toBeVisible();

  // L'agenda n'est PAS diffuse : c'est un outil du facilitateur, rendu sous
  // `@if (isFacilitator())`. Le votant n'en voit rien tant qu'un sujet n'a pas
  // ete rendu courant.
  await expect(voter.locator('ul.agenda')).toHaveCount(0);
  await expect(voter.getByText('Second topic')).toHaveCount(0);

  // Selectionner un sujet le rend courant : c'est LUI qui est annonce a tous.
  await agenda.getByText('Second topic').click();
  await expect(voter.getByText('Second topic')).toBeVisible();

  await facCtx.close();
  await voterCtx.close();
});

test('un round revele peut etre remis a zero puis rejoue', async ({ browser }) => {
  const { ctx: facCtx, page: fac, code } = await createRoom(browser, 'Sam');
  const { ctx: voterCtx, page: voter } = await joinRoom(browser, code, 'Alex');

  await openRound(fac, 'Retry me');
  await voter.getByRole('button', { name: /Advise/ }).click();
  await expect(fac.getByText(/1 \/ \d/)).toBeVisible();
  await fac.getByRole('button', { name: /Reveal/ }).click();
  await expectState(fac, 'Revealed');

  // Remise a zero depuis l'etat revele : le round repart de l'attente.
  await fac.getByRole('button', { name: /Reset/ }).click();
  await expectState(fac, 'Waiting');
  await expectState(voter, 'Waiting');

  // Le vote precedent a bien ete efface : la participation repart de zero.
  // (Sans cela, rouvrir montrerait 1/2 avant meme qu'on ait rejoue.)
  await fac.getByRole('button', { name: /Launch the vote/ }).click();
  await expectState(voter, 'Vote open');
  await expect(fac.getByText(/0 \/ \d/)).toBeVisible();

  // Et le round se rejoue normalement.
  await voter.getByRole('button', { name: /Consult/ }).click();
  await expect(fac.getByText(/1 \/ \d/)).toBeVisible();

  await facCtx.close();
  await voterCtx.close();
});
