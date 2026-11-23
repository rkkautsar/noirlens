import { useEffect, useState } from 'react';

import { DEFAULT_TUNING } from '@/scanner/machine';
import { localDayKey } from './day';
import { entitlements, useEntitlementState } from './entitlements';
import { readScanCount } from './scanLedger';

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
export function useScanAllowance(): AllowanceSnapshot {
  const entitlement = useEntitlementState();
  const unlimited = entitlement.loaded ? entitlements.isUnlimited() : false;
  const [dayKey, setDayKey] = useState(() => localDayKey());
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    void entitlements.hydrate().catch(() => {});
  }, []);

  useEffect(() => {
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
  }, [dayKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = localDayKey();
      if (next !== dayKey) {
        setDayKey(next);
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [dayKey]);

  return {
    loaded: entitlement.loaded && (unlimited || count !== null),
    unlimited,
    remaining:
      unlimited || count === null
        ? null
        : Math.max(0, DEFAULT_TUNING.freeDailyLimit - count),
  };
}
