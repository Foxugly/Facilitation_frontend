import { expect, test } from '@playwright/test';
import { createRoom, expectState, joinRoom, openRound } from './helpers';

/**
 * Invariants du contrat temps reel (delegation-poker-realtime-contract.md).
 *
 * Ce sont les garanties que l'extraction du poker en « activite » risque le plus
 * de casser, parce qu'elles ne tiennent a aucun ecran en particulier : elles
 * naissent de la facon dont le serveur arbitre et rediffuse. Un rendu identique
 * ne prouve pas qu'elles tiennent encore.
 */

test('la reconnexion restaure la salle, le vote et le role (§8)', async ({ browser }) => {
  const { ctx: facCtx, page: fac, code } = await createRoom(browser, 'Sam');
  const { ctx: voterCtx, page: voter } = await joinRoom(browser, code, 'Alex');

  await openRound(fac, 'Budget ownership?');
  await voter.getByRole('button', { name: /Advise/ }).click();
  await expect(fac.getByText(/1 \/ \d/)).toBeVisible();

  // Coupure : on recharge la page du votant. Le token participant vit dans le
  // localStorage, donc la meme personne revient — le serveur doit lui renvoyer
  // un state.sync complet, sans rejeu d'evenements.
  await voter.reload();
  await voter.waitForURL(/\/room\//);

  // La salle est retrouvee dans le meme etat...
  await expectState(voter, 'Vote open');
  await expect(voter.getByText('Budget ownership?')).toBeVisible();

  // ...et surtout le vote deja emis n'est pas perdu : la participation vue par
  // le facilitateur reste a 1. Un state.sync qui oublierait myVote se traduirait
  // ici par un retour a 0.
  await expect(fac.getByText(/1 \/ \d/)).toBeVisible();

  await facCtx.close();
  await voterCtx.close();
});

test("un votant ne dispose d'aucune commande de round (autorite §0.2)", async ({ browser }) => {
  const { ctx: facCtx, page: fac, code } = await createRoom(browser, 'Sam');
  const { ctx: voterCtx, page: voter } = await joinRoom(browser, code, 'Alex');

  // Avant ouverture : le votant n'a ni le formulaire de composition ni le lancement.
  await expect(voter.locator('#subjectDraft')).toHaveCount(0);
  await expect(voter.getByRole('button', { name: /Prepare the vote/ })).toHaveCount(0);
  await expect(voter.getByRole('button', { name: /Launch the vote/ })).toHaveCount(0);

  await openRound(fac, 'Who decides?');

  // Vote ouvert : le votant joue sa carte mais ne peut pas reveler.
  await expect(voter.getByRole('button', { name: /Reveal/ })).toHaveCount(0);
  await voter.getByRole('button', { name: /Advise/ }).click();
  await expect(voter.getByRole('button', { name: /Reveal/ })).toHaveCount(0);

  // Le facilitateur, lui, l'a bien.
  await expect(fac.getByRole('button', { name: /Reveal/ })).toBeVisible();

  await facCtx.close();
  await voterCtx.close();
});

test('aucune valeur de vote ne fuite avant la revelation (secret §6.a)', async ({ browser }) => {
  const { ctx: facCtx, page: fac, code } = await createRoom(browser, 'Sam');
  const { ctx: aCtx, page: alex } = await joinRoom(browser, code, 'Alex');
  const { ctx: bCtx, page: bea } = await joinRoom(browser, code, 'Bea');

  await openRound(fac, 'Secret ballot?');

  // Alex joue « Delegate » (7), Bea joue « Tell » (1) : deux valeurs distinctes,
  // pour qu'une fuite soit identifiable sans ambiguite.
  await alex.getByRole('button', { name: /Delegate/ }).click();
  await bea.getByRole('button', { name: /Tell/ }).click();

  // La participation est publique — c'est le compteur, pas les valeurs.
  await expect(fac.getByText(/2 \/ \d/)).toBeVisible();

  // La verification porte sur LE TAPIS (.felt), pas sur la page entiere : chaque
  // participant garde sa propre main affichee, ou tous les libelles du deck sont
  // presents en permanence. Chercher « Delegate » n'importe ou reviendrait donc a
  // constater qu'une carte est jouable, pas qu'un vote a fuite.
  // La liste des participants a remplace le tapis ovale (design/plateau-en-liste).
  const felt = fac.locator('.roster');
  await expect(felt.getByText('Delegate', { exact: true })).toHaveCount(0);
  await expect(felt.getByText('Tell', { exact: true })).toHaveCount(0);

  // Apres reveal, les cartes se retournent sur le tapis.
  await fac.getByRole('button', { name: /Reveal/ }).click();
  await expectState(fac, 'Revealed');
  await expect(felt.getByText('Delegate', { exact: true }).first()).toBeVisible();
  await expect(felt.getByText('Tell', { exact: true }).first()).toBeVisible();

  await facCtx.close();
  await aCtx.close();
  await bCtx.close();
});
