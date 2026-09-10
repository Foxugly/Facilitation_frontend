/**
 * L'adresse publique d'une salle : la page de jointure, jamais /room/<code>, qui
 * suppose une identite deja etablie. Partagee par le bouton « Partager le lien »
 * et par le QR code, pour qu'ils ne puissent pas diverger.
 */
export function joinUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/join/${code}`;
}
