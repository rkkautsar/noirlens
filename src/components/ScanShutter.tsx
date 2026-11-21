import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography } from '@/theme';
import { MicroLabel } from './ui';

/**
 * Always-mounted hold shutter. It lives outside the standby/aim HUD switch so
 * the press responder survives the camera opening: press to start, aim while
 * holding, release to capture.
 */
export function ScanShutter({
  active,
  scanning,
  onStart,
  onCapture,
}: {
  active: boolean;
  scanning: boolean;
  onStart: () => void;
  onCapture: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.wrap, { paddingBottom: insets.bottom + 12 }]}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          scanning
            ? 'Reading the sign'
            : active
              ? 'Release to capture'
              : 'Hold to scan. Release to capture.'
        }
        disabled={scanning}
        onPressIn={onStart}
        onPressOut={onCapture}
        style={({ pressed }) => [
          styles.bar,
          (active || pressed) && styles.barActive,
          scanning && styles.barBusy,
        ]}
      >
        <View style={styles.copy}>
          <MicroLabel tone={active ? 'accent' : 'dim'}>
            {scanning ? 'READING' : active ? 'RELEASE' : 'HOLD'}
          </MicroLabel>
          <Text style={styles.label}>
            {scanning
              ? 'READING ON-DEVICE'
              : active
                ? 'RELEASE TO CAPTURE'
                : 'HOLD TO SCAN'}
          </Text>
        </View>
        <MicroLabel tone="dim" style={styles.hint}>
          {scanning
            ? 'OCR + TRANSLATION'
            : active
              ? 'CAPTURE ON RELEASE'
              : 'CAMERA OPENS WHILE HELD'}
        </MicroLabel>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bar: {
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(10,10,10,0.94)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  barActive: {
    borderColor: colors.accent,
  },
  barBusy: {
    opacity: 0.8,
  },
  copy: {
    gap: 3,
    flexShrink: 1,
  },
  label: {
    ...typography.label,
    color: colors.foreground,
    letterSpacing: 1.6,
    fontSize: 16,
  },
  hint: {
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: 130,
  },
});
