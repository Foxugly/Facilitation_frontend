import { SubscriptionStatus } from './billing.service';

/** Règles d'affichage des surfaces tarifaires. Fonctions pures, partagées par
 *  teams-list et /pricing, et testées directement (le repo n'a pas de TestBed).
 *  Un accès offert (bypass) neutralise les deux verrous. */

export function needsSubscription(s: SubscriptionStatus | null): boolean {
  return !!s && !s.bypass && s.billingEnabled === true && s.isPaid === false;
}

export function quotaReached(s: SubscriptionStatus | null): boolean {
  return !!s && !s.bypass && s.billingEnabled && s.teamsUsed >= s.quota;
}
