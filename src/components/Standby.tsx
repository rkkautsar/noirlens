import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ScanError } from '@/scanner/machine';
import { colors, typography } from '@/theme';
import { ChipButton, MicroLabel, SolidButton } from './ui';

export function Standby({
  hidden = false,
  remaining,
  error,
  onOpenLanguages,
  onOpenPaywall,
  onDismissError,
}: {
  hidden?: boolean;
  remaining: number | null;
  error: ScanError | null;
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

  const primaryAction = exhausted ? onOpenPaywall : null;

  return (
    <View
      style={[styles.container, hidden && styles.hidden]}
      pointerEvents={hidden ? 'none' : 'auto'}
    >
      <View style={styles.center}>
        <MicroLabel tone="dim">CAMERA OFF</MicroLabel>
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
      </View>

      {error ? (
        <View
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          style={[
            styles.errorCard,
            { marginBottom: insets.bottom + 160 },
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
      ) : null}
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
    letterSpacing: 1.2,
    marginTop: 6,
  },
  subheading: {
    ...typography.body,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 23,
  },
  primaryAction: {
    alignSelf: 'stretch',
    maxWidth: 280,
    width: '100%',
    marginTop: 20,
  },
  errorCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    padding: 18,
    backgroundColor: colors.surfaceRaised,
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
