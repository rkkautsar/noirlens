import { useEffect, useState } from 'react';

import { DEFAULT_TUNING } from '../scanner/machine';
import { localDayKey } from './day';
import { entitlements, useEntitlementState } from './entitlements';
import { readScanCount } from './scanLedger';

export function remainingFor(
  unlimited: boolean,
  scansUsedToday: number | null,
): number | null {
  if (unlimited || scansUsedToday === null) {
    return null;
  }
  return Math.max(0, DEFAULT_TUNING.freeDailyLimit - scansUsedToday);
}

export interface AllowanceSnapshot {
  /** Entitlement and today's ledger are both known. */
  loaded: boolean;
  unlimited: boolean;
  /** Free scans left today; null when unlimited or not loaded yet. */
  remaining: number | null;
}

/**
 * One source for the daily scan allowance. Reads the entitlement and the
 * local-day ledger, re-reads at local midnight, and keeps "not loaded yet"
 * distinct from "zero left".
 */
export function useScanAllowance(enabled = true): AllowanceSnapshot {
  const entitlement = useEntitlementState();
  const unlimited = entitlement.loaded ? entitlements.isUnlimited() : false;
  const [dayKey, setDayKey] = useState(() => localDayKey());
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    void entitlements.hydrate().catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    void readScanCount(dayKey)
      .then((scans) => {
        if (active) {
          setCount(scans);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [dayKey, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const timer = setInterval(() => {
      const next = localDayKey();
      if (next !== dayKey) {
        setDayKey(next);
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [dayKey, enabled]);

  return {
    loaded: entitlement.loaded && (unlimited || count !== null),
    unlimited,
    remaining: remainingFor(unlimited, count),
  };
}
