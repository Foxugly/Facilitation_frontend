export interface BypassPatch {
  subscription_bypass: boolean;
  bypass_note: string;
}

/** Corps de la requête d'octroi/révocation de l'accès offert (§9). Le motif
 *  transmis est toujours celui saisi dans l'écran d'édition (jamais recalculé
 *  ici) — extrait en fonction pure pour être testable sans TestBed, sur le
 *  modèle de billing/gating.ts. */
export function bypassPatch(bypass: boolean, note: string): BypassPatch {
  return { subscription_bypass: bypass, bypass_note: note };
}
