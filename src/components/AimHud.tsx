import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ScanError } from '@/scanner/machine';
import { colors, typography } from '@/theme';
import { TopBar } from './TopBar';
import { MicroLabel } from './ui';

export function AimHud({
  scanning,
  ecoMode,
  onEcoChange,
  remaining,
  unlimited,
  error,
  onOpenLanguages,
  onOpenPaywall,
}: {
  scanning: boolean;
  ecoMode: boolean;
  onEcoChange: (eco: boolean) => void;
  remaining: number | null;
  unlimited: boolean;
  error: ScanError | null;
  onOpenLanguages: () => void;
  onOpenPaywall: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container} pointerEvents="box-none">
      <TopBar
        active
        ecoMode={ecoMode}
        onEcoChange={onEcoChange}
        remaining={remaining}
        unlimited={unlimited}
        onOpenLanguages={onOpenLanguages}
        onOpenPaywall={onOpenPaywall}
        showNavigation={false}
      />

      <View style={styles.reticleArea} pointerEvents="none">
        <View style={styles.reticle}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
          <View style={styles.crosshairHorizontal} />
          <View style={styles.crosshairVertical} />
        </View>
      </View>

      <View style={styles.footerWrap} pointerEvents="none">
        <View style={[styles.footer, { paddingBottom: insets.bottom + 28 }]}>
          {scanning ? (
            <View style={styles.readingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.status}>READING ON-DEVICE</Text>
            </View>
          ) : (
            <Text style={styles.status}>HOLD STEADY</Text>
          )}
          <MicroLabel tone="dim">
            AF / AE LOCKING · SINGLE FRAME · NO UPLOAD
          </MicroLabel>
          {error ? (
            <Text style={styles.errorText} numberOfLines={2}>
              {error.message}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const CORNER = 22;
const CORNER_WIDTH = 1.5;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  reticleArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: 230,
    height: 230,
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: colors.accent,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
  },
  crosshairHorizontal: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 12,
    height: 1,
    marginLeft: -6,
    backgroundColor: colors.accent,
  },
  crosshairVertical: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 1,
    height: 12,
    marginTop: -6,
    backgroundColor: colors.accent,
  },
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footer: {
    paddingTop: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  readingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  status: {
    ...typography.label,
    color: colors.accent,
    letterSpacing: 2,
  },
  errorText: {
    ...typography.body,
    color: colors.warning,
    fontSize: 13,
    textAlign: 'center',
  },
});
