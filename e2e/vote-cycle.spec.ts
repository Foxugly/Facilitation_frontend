import { expect, test } from '@playwright/test';
import { createRoom, expectState, joinRoom, openRound } from './helpers';

// Deux participants isoles jouent un round complet de Delegation Poker :
// creation -> entree -> sujet -> ouverture -> vote -> participation live ->
// revelation -> resultat.

test('two participants run a full vote cycle', async ({ browser }) => {
  const { ctx: facCtx, page: fac, code } = await createRoom(browser, 'Sam');
  const { ctx: voterCtx, page: voter } = await joinRoom(browser, code, 'Alex');

  // Le facilitateur voit le second participant arriver en direct.
  await expect(fac.getByText('Alex')).toBeVisible();

  await openRound(fac, 'Who owns the budget?');
  await expectState(voter, 'Vote open');

  // Le votant joue la carte 5 (Advise).
  await voter.getByRole('button', { name: /Advise/ }).click();

  // La participation remonte au facilitateur, qui revele.
  await expect(fac.getByText(/1 \/ \d/)).toBeVisible();
  await fac.getByRole('button', { name: /Reveal/ }).click();
  await expectState(fac, 'Revealed');

  // Revele -> le facilitateur fige le resultat (defaut = mode).
  const setResult = fac.getByRole('button', { name: /Set result/ });
  await expect(setResult).toBeVisible();
  await setResult.click();

  await expectState(fac, 'Result set');
  await expect(fac.getByText(/Chosen level/)).toBeVisible();

  await facCtx.close();
  await voterCtx.close();
});
