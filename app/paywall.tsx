import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetHeader } from '@/components/SheetHeader';
import { Badge, MicroLabel, SolidButton } from '@/components/ui';
import { FREE_DAILY_SCAN_LIMIT } from '@/scanner/machine';
import { localDayKey } from '@/services/day';
import {
  hasUnlimitedScans,
  type EntitlementTier,
} from '@/services/entitlementLogic';
import { entitlements, useEntitlementState } from '@/services/entitlements';
import { purchaseTier, resetEntitlementForDev } from '@/services/purchases';
import { readScanCount } from '@/services/scanLedger';
import { colors, typography } from '@/theme';

type PaidTier = Exclude<EntitlementTier, 'FREE'>;

function formatDay(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const entitlement = useEntitlementState();
  const mounted = useRef(true);

  const [usedScans, setUsedScans] = useState<number | null>(null);
  const [busy, setBusy] = useState<PaidTier | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    void entitlements.hydrate();
    void readScanCount(localDayKey())
      .then((count) => {
        if (mounted.current) {
          setUsedScans(count);
        }
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);

  const unlimited = hasUnlimitedScans(entitlement, Date.now());
  const scansLeft =
    usedScans === null
      ? null
      : Math.max(0, FREE_DAILY_SCAN_LIMIT - usedScans);

  const handlePurchase = async (tier: PaidTier) => {
    if (busy !== null) {
      return;
    }
    setBusy(tier);
    setNotice(null);

    const outcome = await purchaseTier(tier);
    if (!mounted.current) {
      return;
    }
    if (outcome.status === 'unavailable') {
      setNotice(
        'Purchases are not active in this build. This screen is wired for StoreKit 2.',
      );
    }
    setBusy(null);
  };

  const tripPassActive = entitlement.tier === 'TRIP_PASS_14D';
  const lifetimeActive = entitlement.tier === 'LIFETIME_PRO';

  return (
    <View style={styles.container}>
      <SheetHeader
        title="NOIRLENS PRO"
        subtitle="ONE-TIME · NO SUBSCRIPTION"
        onClose={() => {
          router.back();
        }}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.counterCard}>
          <MicroLabel tone="dim">TODAY</MicroLabel>
          <View style={styles.counterRow}>
            <Text style={styles.counterBig}>
              {unlimited ? '∞' : (scansLeft ?? '—')}
            </Text>
            <Text style={styles.counterSlash}>
              {unlimited ? 'SCANS' : `/ ${FREE_DAILY_SCAN_LIMIT}`}
            </Text>
          </View>
          <Text style={styles.counterSub}>
            {unlimited
              ? 'Unlimited scans. Everything stays offline.'
              : 'free scans left today. Resets at local midnight.'}
          </Text>
        </View>

        <View style={styles.freeCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planTitle}>FREE</Text>
            {entitlement.tier === 'FREE' ? (
              <Badge label="CURRENT" tone="muted" />
            ) : null}
          </View>
          <Text style={styles.planDetail}>
            {FREE_DAILY_SCAN_LIMIT} scans per day. Offline packs, eco HUD and
            frozen results included.
          </Text>
        </View>

        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planTitle}>14-DAY TRIP PASS</Text>
            {tripPassActive ? <Badge label="ACTIVE" tone="success" /> : null}
          </View>
          <Text style={styles.price}>$4.99</Text>
          <Text style={styles.planDetail}>
            Unlimited scans for one trip. Non-renewing; expires after 14 days.
          </Text>
          {tripPassActive && entitlement.tripPassExpiresAt !== null ? (
            <MicroLabel tone="success">
              ACTIVE UNTIL {formatDay(entitlement.tripPassExpiresAt)}
            </MicroLabel>
          ) : null}
          <SolidButton
            label={tripPassActive ? 'ACTIVE' : 'UNLOCK 14 DAYS'}
            onPress={() => {
              void handlePurchase('TRIP_PASS_14D');
            }}
            disabled={tripPassActive || busy !== null}
            loading={busy === 'TRIP_PASS_14D'}
            primary={!tripPassActive}
          />
        </View>

        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planTitle}>LIFETIME UNLOCK</Text>
            {lifetimeActive ? <Badge label="ACTIVE" tone="success" /> : null}
          </View>
          <Text style={styles.price}>$14.99</Text>
          <Text style={styles.planDetail}>
            Every scan, forever. Pay once; no account, no server, no renewal.
          </Text>
          <SolidButton
            label={lifetimeActive ? 'ACTIVE' : 'UNLOCK LIFETIME'}
            onPress={() => {
              void handlePurchase('LIFETIME_PRO');
            }}
            disabled={lifetimeActive || busy !== null}
            loading={busy === 'LIFETIME_PRO'}
            primary={!lifetimeActive}
          />
        </View>

        {notice ? (
          <View style={styles.notice}>
            <MicroLabel tone="warning">NOTICE</MicroLabel>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {__DEV__ ? (
          <View style={styles.devCard}>
            <MicroLabel tone="warning">DEVELOPMENT BUILD</MicroLabel>
            <Text style={styles.devText}>
              Purchases are simulated locally so the entitlement gate can be
              tested. Production builds pass through the StoreKit 2 provider.
            </Text>
            <SolidButton
              label="RESET TO FREE"
              onPress={() => {
                void resetEntitlementForDev();
              }}
            />
          </View>
        ) : null}

        <Text style={styles.footer}>
          Payments are handled by Apple when StoreKit is enabled. NoirLens never
          receives your card, your frames or your text.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 14,
  },
  counterCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
    gap: 6,
    backgroundColor: colors.surface,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  counterBig: {
    fontSize: 56,
    lineHeight: 62,
    fontWeight: '700',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  counterSlash: {
    ...typography.label,
    color: colors.dim,
    paddingBottom: 10,
  },
  counterSub: {
    ...typography.body,
    color: colors.muted,
    fontSize: 13,
  },
  freeCard: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  planCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 18,
    gap: 10,
    backgroundColor: colors.surfaceRaised,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  planTitle: {
    ...typography.label,
    letterSpacing: 1.8,
    color: colors.foreground,
  },
  price: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  planDetail: {
    ...typography.body,
    color: colors.muted,
    fontSize: 13,
  },
  notice: {
    borderLeftWidth: 2,
    borderLeftColor: colors.warning,
    paddingLeft: 12,
    gap: 6,
  },
  noticeText: {
    ...typography.body,
    color: colors.foreground,
    fontSize: 13,
  },
  devCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  devText: {
    ...typography.body,
    color: colors.muted,
    fontSize: 12,
  },
  footer: {
    ...typography.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.dim,
  },
});
