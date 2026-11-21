import { useSyncExternalStore } from 'react';

import { readMeta, writeMeta } from './db';
import {
  FREE_ENTITLEMENT,
  grantForTier,
  hasUnlimitedScans,
  resolveEntitlement,
  type EntitlementGrant,
  type EntitlementTier,
} from './entitlementLogic';

export interface EntitlementSnapshot extends EntitlementGrant {
  loaded: boolean;
}

const META_KEY = 'entitlement';
const INITIAL: EntitlementSnapshot = { ...FREE_ENTITLEMENT, loaded: false };

function parseStored(raw: string | null): EntitlementGrant | null {
  if (raw === null) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as {
      tier?: unknown;
      tripPassExpiresAt?: unknown;
    };
    if (
      value.tier !== 'FREE' &&
      value.tier !== 'TRIP_PASS_14D' &&
      value.tier !== 'LIFETIME_PRO'
    ) {
      return null;
    }
    return {
      tier: value.tier,
      tripPassExpiresAt:
        typeof value.tripPassExpiresAt === 'number'
          ? value.tripPassExpiresAt
          : null,
    };
  } catch {
    return null;
  }
}

class EntitlementManager {
  private snapshot: EntitlementSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private loadPromise: Promise<void> | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): EntitlementSnapshot => this.snapshot;

  private emit(next: EntitlementSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  async hydrate(): Promise<void> {
    if (this.snapshot.loaded) {
      return;
    }
    if (this.loadPromise === null) {
      this.loadPromise = this.load().finally(() => {
        this.loadPromise = null;
      });
    }
    return this.loadPromise;
  }

  private async load(): Promise<void> {
    try {
      const stored = parseStored(await readMeta(META_KEY));
      const resolved = resolveEntitlement(
        stored ?? FREE_ENTITLEMENT,
        Date.now(),
      );
      this.emit({ ...resolved, loaded: true });

      if (
        stored !== null &&
        (stored.tier !== resolved.tier ||
          stored.tripPassExpiresAt !== resolved.tripPassExpiresAt)
      ) {
        void writeMeta(META_KEY, JSON.stringify(resolved)).catch(() => {});
      }
    } catch {
      this.emit({ ...FREE_ENTITLEMENT, loaded: true });
    }
  }

  async applyTier(tier: EntitlementTier): Promise<void> {
    const grant = grantForTier(tier, Date.now());
    this.emit({ ...grant, loaded: true });
    try {
      await writeMeta(META_KEY, JSON.stringify(grant));
    } catch {
      // The in-memory grant still applies for this session; the next launch
      // will fall back to the last persisted value.
    }
  }

  isUnlimited(now: number = Date.now()): boolean {
    return hasUnlimitedScans(this.snapshot, now);
  }
}

export const entitlements = new EntitlementManager();

export function useEntitlementState(): EntitlementSnapshot {
  return useSyncExternalStore(
    entitlements.subscribe,
    entitlements.getSnapshot,
    entitlements.getSnapshot,
  );
}
