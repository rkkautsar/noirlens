import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';

import { colors, radius, typography } from '@/theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

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
  icon,
  iconOnly = false,
  onPress,
  active = false,
  disabled = false,
}: {
  label: string;
  icon?: IconName;
  iconOnly?: boolean;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const tint = active ? colors.background : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      hitSlop={8}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        iconOnly && styles.chipIconOnly,
        active && styles.chipActive,
        focused && styles.focused,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={iconOnly ? 18 : 14} color={tint} />
      ) : null}
      {iconOnly ? null : (
        <Text style={[styles.chipText, active && styles.chipTextActive]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function SolidButton({
  label,
  icon,
  iconOnly = false,
  onPress,
  primary = false,
  disabled = false,
  loading = false,
}: {
  label: string;
  icon?: IconName;
  iconOnly?: boolean;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      hitSlop={6}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.solid,
        primary ? styles.solidPrimary : styles.solidGhost,
        iconOnly && styles.solidIconOnly,
        focused && styles.focused,
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
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={iconOnly ? 20 : 15}
              color={primary ? colors.background : colors.foreground}
            />
          ) : null}
          {iconOnly ? null : (
            <Text
              style={[
                styles.solidText,
                primary ? styles.solidPrimaryText : styles.solidGhostText,
              ]}
            >
              {label}
            </Text>
          )}
        </>
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
    <View style={styles.badge}>
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
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    // Translucent so icon-only chips stay readable over dense result text.
    backgroundColor: 'rgba(10,10,10,0.78)',
  },
  chipIconOnly: {
    width: 46,
    height: 46,
    minHeight: 46,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: radius.lg,
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
  focused: {
    borderColor: colors.focus,
    backgroundColor: colors.surfaceRaised,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.35,
  },
  solid: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  solidIconOnly: {
    width: 52,
    paddingHorizontal: 0,
    borderRadius: radius.lg,
  },
  solidPrimary: {
    backgroundColor: colors.accent,
  },
  solidGhost: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
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
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.surfaceRaised,
  },
  badgeText: {
    ...typography.micro,
    fontSize: 9,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSoft,
  },
});
