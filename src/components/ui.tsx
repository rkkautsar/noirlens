import { useMemo } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, typography } from '@/theme';

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
  const tint = active ? colors.background : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        iconOnly && styles.chipIconOnly,
        active && styles.chipActive,
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.solid,
        primary ? styles.solidPrimary : styles.solidGhost,
        iconOnly && styles.solidIconOnly,
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
              color={primary ? colors.background : colors.accent}
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

export function FilterToggle({
  ecoMode,
  onChange,
}: {
  ecoMode: boolean;
  onChange: (eco: boolean) => void;
}) {
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 16) {
            onChange(true);
          } else if (gesture.dx < -16) {
            onChange(false);
          } else {
            onChange(!ecoMode);
          }
        },
      }),
    [ecoMode, onChange],
  );

  return (
    <View
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={`Filter ${ecoMode ? 'Noir' : 'Color'}. Swipe to change.`}
      style={styles.filter}
    >
      <View style={[styles.filterOption, ecoMode && styles.filterOptionActive]}>
        <Text style={[styles.filterText, ecoMode && styles.filterTextActive]}>
          NOIR
        </Text>
      </View>
      <View
        style={[styles.filterOption, !ecoMode && styles.filterOptionActive]}
      >
        <Text style={[styles.filterText, !ecoMode && styles.filterTextActive]}>
          COLOR
        </Text>
      </View>
    </View>
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
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  chipIconOnly: {
    width: 46,
    height: 46,
    minHeight: 46,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 16,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  filter: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  filterOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  filterOptionActive: {
    backgroundColor: colors.accent,
  },
  filterText: {
    ...typography.micro,
    color: colors.foreground,
    textTransform: 'uppercase',
  },
  filterTextActive: {
    color: colors.background,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  solidIconOnly: {
    width: 52,
    paddingHorizontal: 0,
    borderRadius: 16,
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
