import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ScanError } from '@/scanner/machine';
import { colors, typography } from '@/theme';
import { TopBar } from './TopBar';
import { ChipButton, MicroLabel } from './ui';

export function Standby({
  remaining,
  unlimited,
  hydrated,
  motionAvailable,
  error,
  ecoMode,
  onEcoChange,
  onWake,
  onOpenLanguages,
  onOpenPaywall,
  onDismissError,
}: {
  remaining: number | null;
  unlimited: boolean;
  hydrated: boolean;
  motionAvailable: boolean;
  error: ScanError | null;
  ecoMode: boolean;
  onEcoChange: (eco: boolean) => void;
  onWake: () => void;
  onOpenLanguages: () => void;
  onOpenPaywall: () => void;
  onDismissError: () => void;
}) {
  const insets = useSafeAreaInsets();
  const exhausted = remaining === 0;

  const heading = exhausted ? 'DAILY LIMIT REACHED' : 'RAISE TO SCAN';
  const subheading = exhausted
    ? 'Unlock unlimited scans to keep going.'
    : 'Camera is powered down until you lift the phone.';

  const counter = !hydrated
    ? 'LOADING COUNTER'
    : unlimited
      ? 'TAP TO SCAN · PRO'
      : `${remaining ?? 0} SCANS LEFT TODAY`;

  const primaryAction = exhausted ? onOpenPaywall : onWake;

  return (
    <View style={styles.container}>
      <TopBar
        active={false}
        ecoMode={ecoMode}
        onEcoChange={onEcoChange}
        remaining={remaining}
        unlimited={unlimited}
        onOpenLanguages={onOpenLanguages}
        onOpenPaywall={onOpenPaywall}
      />

      <View style={styles.center}>
        <MicroLabel tone="dim">SENSOR ASLEEP · 0 W</MicroLabel>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.subheading}>{subheading}</Text>

        <Pressable
          accessibilityRole="button"
          onPress={primaryAction}
          style={({ pressed }) => [styles.counterPill, pressed && styles.pressed]}
        >
          <Text style={styles.counterText}>
            {exhausted ? 'VIEW OPTIONS' : counter}
          </Text>
        </Pressable>

        {!motionAvailable ? (
          <MicroLabel tone="warning" style={styles.motionNote}>
            MOTION UNAVAILABLE · TAP TO SCAN
          </MicroLabel>
        ) : null}
      </View>

      {error ? (
        <View
          style={[
            styles.errorCard,
            { marginBottom: insets.bottom + 16 },
          ]}
        >
          <MicroLabel
            tone={error.fatal ? 'danger' : 'warning'}
            style={styles.errorKicker}
          >
            {error.fatal ? 'ACTION NEEDED' : 'SCAN NOTICE'}
          </MicroLabel>
          <Text style={styles.errorMessage}>{error.message}</Text>
          <View style={styles.errorActions}>
            {error.code === 'language_pack_missing' ? (
              <ChipButton label="LANGUAGE PACKS" onPress={onOpenLanguages} />
            ) : null}
            {error.code === 'permission_denied' ? (
              <ChipButton
                label="OPEN SETTINGS"
                onPress={() => {
                  void Linking.openSettings().catch(() => {});
                }}
              />
            ) : null}
            <ChipButton label="DISMISS" onPress={onDismissError} />
          </View>
        </View>
      ) : (
        <MicroLabel
          tone="dim"
          style={[styles.footer, { marginBottom: insets.bottom + 20 }]}
        >
          CAMERA OFF · SENSOR POWERED DOWN
        </MicroLabel>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  heading: {
    ...typography.result,
    color: colors.foreground,
    textAlign: 'center',
    letterSpacing: 3,
    marginTop: 8,
  },
  subheading: {
    ...typography.body,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 280,
  },
  counterPill: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  counterText: {
    ...typography.micro,
    color: colors.accent,
  },
  pressed: {
    opacity: 0.65,
  },
  motionNote: {
    marginTop: 8,
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
  },
  errorCard: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    backgroundColor: colors.surface,
    gap: 10,
  },
  errorKicker: {
    fontSize: 9,
  },
  errorMessage: {
    ...typography.body,
    color: colors.foreground,
  },
  errorActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
