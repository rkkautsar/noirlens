export const TRIP_PASS_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export type EntitlementTier = 'FREE' | 'TRIP_PASS_14D' | 'LIFETIME_PRO';

export interface EntitlementGrant {
  tier: EntitlementTier;
  /** Epoch ms; only meaningful for TRIP_PASS_14D. */
  tripPassExpiresAt: number | null;
}

export const FREE_ENTITLEMENT: EntitlementGrant = {
  tier: 'FREE',
  tripPassExpiresAt: null,
};

export function grantForTier(
  tier: EntitlementTier,
  now: number,
): EntitlementGrant {
  switch (tier) {
    case 'LIFETIME_PRO':
      return { tier, tripPassExpiresAt: null };
    case 'TRIP_PASS_14D':
      return { tier, tripPassExpiresAt: now + TRIP_PASS_DURATION_MS };
    case 'FREE':
      return FREE_ENTITLEMENT;
  }
}

/**
 * Expired trip passes fall back to FREE. Called whenever the entitlement is
 * loaded or checked, so a pass cannot outlive its 14 days even if the app was
 * closed when it lapsed.
 */
export function resolveEntitlement(
  grant: EntitlementGrant,
  now: number,
): EntitlementGrant {
  switch (grant.tier) {
    case 'LIFETIME_PRO':
      return grant;
    case 'TRIP_PASS_14D':
      if (grant.tripPassExpiresAt !== null && grant.tripPassExpiresAt > now) {
        return grant;
      }
      return FREE_ENTITLEMENT;
    case 'FREE':
      return FREE_ENTITLEMENT;
  }
}

export function hasUnlimitedScans(
  grant: EntitlementGrant,
  now: number,
): boolean {
  return resolveEntitlement(grant, now).tier !== 'FREE';
}
