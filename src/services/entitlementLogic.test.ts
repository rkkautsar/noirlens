import { describe, expect, it } from 'vitest';

import {
  FREE_ENTITLEMENT,
  TRIP_PASS_DURATION_MS,
  grantForTier,
  hasUnlimitedScans,
  resolveEntitlement,
} from './entitlementLogic';

const NOW = 1_800_000_000_000;

describe('grantForTier', () => {
  it('sets a 14-day expiry for a trip pass', () => {
    expect(grantForTier('TRIP_PASS_14D', NOW)).toEqual({
      tier: 'TRIP_PASS_14D',
      tripPassExpiresAt: NOW + TRIP_PASS_DURATION_MS,
    });
  });

  it('never expires a lifetime grant', () => {
    expect(grantForTier('LIFETIME_PRO', NOW)).toEqual({
      tier: 'LIFETIME_PRO',
      tripPassExpiresAt: null,
    });
  });
});

describe('resolveEntitlement', () => {
  it('keeps an active trip pass', () => {
    const grant = { tier: 'TRIP_PASS_14D' as const, tripPassExpiresAt: NOW + 1 };
    expect(resolveEntitlement(grant, NOW)).toEqual(grant);
  });

  it('downgrades an expired trip pass to FREE', () => {
    const grant = { tier: 'TRIP_PASS_14D' as const, tripPassExpiresAt: NOW };
    expect(resolveEntitlement(grant, NOW)).toEqual(FREE_ENTITLEMENT);
  });

  it('downgrades a trip pass with no expiry', () => {
    expect(
      resolveEntitlement({ tier: 'TRIP_PASS_14D', tripPassExpiresAt: null }, NOW),
    ).toEqual(FREE_ENTITLEMENT);
  });

  it('keeps lifetime unlocked regardless of time', () => {
    const grant = { tier: 'LIFETIME_PRO' as const, tripPassExpiresAt: null };
    expect(resolveEntitlement(grant, NOW + 10 * TRIP_PASS_DURATION_MS)).toEqual(
      grant,
    );
  });
});

describe('hasUnlimitedScans', () => {
  it('is false for free and expired passes', () => {
    expect(hasUnlimitedScans(FREE_ENTITLEMENT, NOW)).toBe(false);
    expect(
      hasUnlimitedScans(
        { tier: 'TRIP_PASS_14D', tripPassExpiresAt: NOW - 1 },
        NOW,
      ),
    ).toBe(false);
  });

  it('is true for active passes and lifetime', () => {
    expect(
      hasUnlimitedScans(
        { tier: 'TRIP_PASS_14D', tripPassExpiresAt: NOW + 1 },
        NOW,
      ),
    ).toBe(true);
    expect(
      hasUnlimitedScans({ tier: 'LIFETIME_PRO', tripPassExpiresAt: null }, NOW),
    ).toBe(true);
  });
});
