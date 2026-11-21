import { entitlements } from './entitlements';
import type { EntitlementTier } from './entitlementLogic';

export type PurchaseOutcome =
  | { status: 'purchased' }
  | { status: 'unavailable'; reason: string };

/**
 * Entitlement gate. The StoreKit 2 provider belongs here; until it is wired,
 * purchases are only simulated in development builds. Production builds return
 * `unavailable` instead of pretending to charge the user.
 */
export async function purchaseTier(
  tier: Exclude<EntitlementTier, 'FREE'>,
): Promise<PurchaseOutcome> {
  if (__DEV__) {
    await entitlements.applyTier(tier);
    return { status: 'purchased' };
  }
  return { status: 'unavailable', reason: 'storekit_not_configured' };
}

export async function resetEntitlementForDev(): Promise<void> {
  if (__DEV__) {
    await entitlements.applyTier('FREE');
  }
}
