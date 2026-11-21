import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { colors, typography } from '@/theme';

type Tone =
  | 'muted'
  | 'accent'
  | 'dim'
  | 'danger'
  | 'warning'
  | 'success'
  | 'foreground';

export function MicroLabel({
  children,
  tone = 'muted',
  style,
}: {
  children: React.ReactNode;
  tone?: Tone;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.micro, { color: colors[tone] }, style]}>
      {children}
    </Text>
  );
}

export function ChipButton({
  label,
  onPress,
  active = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SolidButton({
  label,
  onPress,
  primary = false,
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.solid,
        primary ? styles.solidPrimary : styles.solidGhost,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={primary ? colors.background : colors.accent}
        />
      ) : (
        <Text
          style={[
            styles.solidText,
            primary ? styles.solidPrimaryText : styles.solidGhostText,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Badge({
  label,
  tone = 'muted',
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <View style={[styles.badge, { borderColor: colors[tone] }]}>
      <Text style={[styles.badgeText, { color: colors[tone] }]}>{label}</Text>
    </View>
  );
}

export function Hairline() {
  return <View style={styles.hairline} />;
}

const styles = StyleSheet.create({
  micro: {
    ...typography.micro,
    textTransform: 'uppercase',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  chipText: {
    ...typography.micro,
    color: colors.foreground,
    textTransform: 'uppercase',
  },
  chipTextActive: {
    color: colors.background,
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.35,
  },
  solid: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solidPrimary: {
    backgroundColor: colors.accent,
  },
  solidGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  solidText: {
    ...typography.label,
    textTransform: 'uppercase',
  },
  solidPrimaryText: {
    color: colors.background,
  },
  solidGhostText: {
    color: colors.foreground,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeText: {
    ...typography.micro,
    fontSize: 9,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
