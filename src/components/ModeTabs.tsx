import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '@/theme';

export type AppMode = 'camera' | 'translate';

function Tab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
    >
      <Text style={[styles.label, active && styles.labelActive]}>
        {label}
      </Text>
      <View style={[styles.underline, active && styles.underlineActive]} />
    </Pressable>
  );
}

/**
 * Minimal top mode switcher: no container, no border. The active mode is the
 * only accent element, underlined like a page tab.
 */
export function ModeTabs({
  active,
  onCamera,
  onTranslate,
}: {
  active: AppMode;
  onCamera: () => void;
  onTranslate: () => void;
}) {
  const tabs = (
    <>
      <Tab label="CAMERA" active={active === 'camera'} onPress={onCamera} />
      <Tab
        label="TRANSLATE"
        active={active === 'translate'}
        onPress={onTranslate}
      />
    </>
  );
  return (
    <View pointerEvents="box-none" style={styles.inlineRow}>
      {tabs}
    </View>
  );
}

const styles = StyleSheet.create({
  inlineRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 26,
    paddingTop: 10,
    paddingBottom: 2,
  },
  tab: {
    alignItems: 'center',
    paddingTop: 6,
  },
  label: {
    ...typography.micro,
    color: colors.dim,
    letterSpacing: 1.8,
  },
  labelActive: {
    color: colors.accent,
  },
  underline: {
    marginTop: 5,
    height: 2,
    width: '100%',
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  underlineActive: {
    backgroundColor: colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
});
