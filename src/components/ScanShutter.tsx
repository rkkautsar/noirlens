import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography } from '@/theme';

/**
 * Always-mounted hold shutter. It lives outside the standby/aim HUD switch so
 * the press responder survives the camera opening: press to start, aim while
 * holding, release to capture.
 */
export function ScanShutter({
  active,
  scanning,
  next = false,
  onStart,
  onCapture,
}: {
  active: boolean;
  scanning: boolean;
  next?: boolean;
  onStart: () => void;
  onCapture: () => void;
}) {
  const insets = useSafeAreaInsets();

  const label = scanning
    ? 'READING ON-DEVICE'
    : active
      ? 'RELEASE TO CAPTURE'
      : next
        ? 'NEXT SCAN'
        : 'HOLD TO SCAN';
  const icon: React.ComponentProps<typeof Ionicons>['name'] = scanning
    ? 'hourglass-outline'
    : active
      ? 'radio-button-on'
      : next
        ? 'refresh'
        : 'hand-left-outline';

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
              : next
                ? 'Hold for the next scan. Release to capture.'
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
        <Ionicons
          name={icon}
          size={18}
          color={active ? colors.accent : colors.muted}
        />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[styles.label, active && styles.labelActive]}
        >
          {label}
        </Text>
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
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(10,10,10,0.94)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  barActive: {
    borderColor: colors.accent,
  },
  barBusy: {
    opacity: 0.8,
  },
  label: {
    ...typography.label,
    color: colors.foreground,
    letterSpacing: 1.6,
    fontSize: 16,
    flexShrink: 1,
  },
  labelActive: {
    color: colors.accent,
  },
});
