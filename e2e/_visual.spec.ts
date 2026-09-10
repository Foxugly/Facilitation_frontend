import { test } from '@playwright/test';
import { createRoom, joinRoom, openRound, openTeamRoom } from './helpers';

/**
 * Harnais de CAPTURE, pas de test : il ne verifie rien, il photographie.
 *
 * Sert a comparer le rendu avant / apres un refactoring de structure, la ou les
 * scenarios e2e sont aveugles — ils cliquent des boutons, ne comparent aucun
 * pixel. Le dossier de sortie est passe par SHOT_DIR.
 *
 * Fichier prefixe `_` et non versionne : c'est un outil de passage.
 */
const DIR = process.env.SHOT_DIR || 'shots/before';

test('captures des etats de la salle', async ({ browser }) => {
  const { page: fac, code } = await createRoom(browser, 'Sam');
  const { page: voter } = await joinRoom(browser, code, 'Alex');
  await fac.waitForTimeout(500);

  await fac.screenshot({ path: `${DIR}/01-idle-facilitateur.png`, fullPage: true });
  await voter.screenshot({ path: `${DIR}/02-idle-votant.png`, fullPage: true });

  await openRound(fac, 'Who owns the budget?');
  await fac.waitForTimeout(400);
  await fac.screenshot({ path: `${DIR}/03-open-facilitateur.png`, fullPage: true });
  await voter.screenshot({ path: `${DIR}/04-open-votant.png`, fullPage: true });

  await voter.getByRole('button', { name: /Advise/ }).click();
  await fac.getByRole('button', { name: /Reveal/ }).click();
  await fac.waitForTimeout(600);
  await fac.screenshot({ path: `${DIR}/05-revealed-facilitateur.png`, fullPage: true });
  await voter.screenshot({ path: `${DIR}/06-revealed-votant.png`, fullPage: true });

  await fac.getByRole('button', { name: /Set result/ }).click();
  await fac.waitForTimeout(600);
  await fac.screenshot({ path: `${DIR}/07-acted-facilitateur.png`, fullPage: true });

  // Largeur mobile : le @media est le point le plus fragile du decoupage.
  await voter.setViewportSize({ width: 390, height: 844 });
  await voter.waitForTimeout(400);
  await voter.screenshot({ path: `${DIR}/08-mobile-votant.png`, fullPage: true });
});

test('captures de la salle d equipe', async ({ browser }) => {
  const { page: fac } = await openTeamRoom(browser);
  await fac.waitForTimeout(600);
  // Panneau complet : timer + mode de revelation + selecteur de deck.
  await fac.screenshot({ path: `${DIR}/09-equipe-panneau.png`, fullPage: true });
});
