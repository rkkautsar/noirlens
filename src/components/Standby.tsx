import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ScanError } from '@/scanner/machine';
import { colors, typography } from '@/theme';
import { TopBar } from './TopBar';
import { ChipButton, MicroLabel, SolidButton } from './ui';

export function Standby({
  hidden = false,
  remaining,
  unlimited,
  hydrated,
  error,
  ecoMode,
  onEcoChange,
  onOpenLanguages,
  onOpenPaywall,
  onDismissError,
}: {
  hidden?: boolean;
  remaining: number | null;
  unlimited: boolean;
  hydrated: boolean;
  error: ScanError | null;
  ecoMode: boolean;
  onEcoChange: (eco: boolean) => void;
  onOpenLanguages: () => void;
  onOpenPaywall: () => void;
  onDismissError: () => void;
}) {
  const insets = useSafeAreaInsets();
  const exhausted = remaining === 0;

  const heading = exhausted ? 'DAILY LIMIT REACHED' : 'HOLD TO SCAN';
  const subheading = exhausted
    ? 'Unlock unlimited scans to keep going.'
    : 'Press and hold anywhere on the screen. Aim while it is held, then release to capture.';

  const counter = !hydrated
    ? 'LOADING COUNTER'
    : unlimited
      ? 'PRO · UNLIMITED SCANS'
      : `${remaining ?? 0} OF 15 FREE SCANS LEFT TODAY`;

  const primaryAction = exhausted ? onOpenPaywall : null;

  return (
    <View
      style={[styles.container, hidden && styles.hidden]}
      pointerEvents={hidden ? 'none' : 'auto'}
    >
      <TopBar
        ecoMode={ecoMode}
        onEcoChange={onEcoChange}
        remaining={remaining}
        unlimited={unlimited}
        onOpenLanguages={onOpenLanguages}
        onOpenPaywall={onOpenPaywall}
      />

      <View style={styles.center}>
        <MicroLabel tone="dim">CAMERA OFF · 0 W</MicroLabel>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.subheading}>{subheading}</Text>

        {primaryAction ? (
          <View style={styles.primaryAction}>
            <SolidButton
              label="VIEW OPTIONS"
              icon="options-outline"
              onPress={primaryAction}
              primary
            />
          </View>
        ) : null}
        <Text style={styles.counterText}>{counter}</Text>
      </View>

      {error ? (
        <View
          style={[
            styles.errorCard,
            { marginBottom: insets.bottom + 104 },
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
              <ChipButton
                label="LANGUAGE PACKS"
                icon="download-outline"
                onPress={onOpenLanguages}
              />
            ) : null}
            {error.code === 'permission_denied' ? (
              <ChipButton
                label="OPEN SETTINGS"
                icon="settings-outline"
                onPress={() => {
                  void Linking.openSettings().catch(() => {});
                }}
              />
            ) : null}
            <ChipButton label="DISMISS" icon="close" onPress={onDismissError} />
          </View>
        </View>
      ) : (
        <MicroLabel
          tone="dim"
          style={[styles.footer, { marginBottom: insets.bottom + 104 }]}
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
  hidden: {
    opacity: 0,
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
  primaryAction: {
    alignSelf: 'stretch',
    maxWidth: 280,
    width: '100%',
    marginTop: 20,
  },
  counterText: {
    ...typography.micro,
    color: colors.accent,
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
