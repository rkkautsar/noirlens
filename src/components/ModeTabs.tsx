import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography } from '@/theme';

export type AppMode = 'camera' | 'translate';

/** Height of the tab row above the safe area; screens lift controls by this. */
export const MODE_TABS_HEIGHT = 56;

function Tab({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: 'camera-outline' | 'language-outline';
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={active ? colors.accent : colors.muted}
      />
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

export function ModeTabs({
  active,
  onCamera,
  onTranslate,
}: {
  active: AppMode;
  onCamera: () => void;
  onTranslate: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      <Tab
        label="CAMERA"
        icon="camera-outline"
        active={active === 'camera'}
        onPress={onCamera}
      />
      <Tab
        label="TRANSLATE"
        icon="language-outline"
        active={active === 'translate'}
        onPress={onTranslate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: 'rgba(9,9,10,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    zIndex: 20,
  },
  tab: {
    flex: 1,
    height: MODE_TABS_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    ...typography.micro,
    color: colors.muted,
  },
  labelActive: {
    color: colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
});
