/** Secondes restantes avant l'echeance, ou null s'il n'y a pas de timer.
 *  Purement cosmetique : le serveur fait autorite sur l'expiration reelle. */
export function secondsLeft(deadline: string | null, now: Date = new Date()): number | null {
  if (!deadline) return null;
  const remaining = (new Date(deadline).getTime() - now.getTime()) / 1000;
  return Math.max(0, Math.ceil(remaining));
}
