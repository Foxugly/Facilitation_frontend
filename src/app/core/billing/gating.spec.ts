import { describe, expect, it } from 'vitest';

import { SubscriptionStatus } from './billing.service';
import { needsSubscription, quotaReached } from './gating';

const base: SubscriptionStatus = {
  billingEnabled: true, isPaid: false, status: '', plan: '', interval: '',
  quota: 0, teamsUsed: 3, canManage: false, bypass: false,
};

describe('gating tarifaire', () => {
  it('demande un abonnement quand le billing est actif et le compte non payant', () => {
    expect(needsSubscription(base)).toBe(true);
    expect(quotaReached(base)).toBe(true);
  });

  it('ne demande rien quand le compte a un acces offert', () => {
    const offered = { ...base, bypass: true };
    expect(needsSubscription(offered)).toBe(false);
    expect(quotaReached(offered)).toBe(false);
  });
});
