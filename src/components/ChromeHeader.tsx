import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModeTabs, type AppMode } from './ModeTabs';
import { ChipButton } from './ui';
import { colors, layout, typography } from '@/theme';

/**
 * Fixed screen header: brand + counter, then the camera/translate mode tabs.
 * Every primary screen renders this at the same absolute position so the
 * header never shifts between camera, result, and capture.
 */
export function ChromeHeader({
  active,
  remaining,
  unlimited,
  onOpenPaywall,
  onCamera,
  onTranslate,
  onBack,
}: {
  active: AppMode;
  remaining: number | null;
  unlimited: boolean;
  onOpenPaywall: () => void;
  onCamera: () => void;
  onTranslate: () => void;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const counter = unlimited
    ? 'PRO'
    : remaining !== null
      ? `${remaining} LEFT`
      : null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.header, { paddingTop: insets.top + 8 }]}
    >
      <View pointerEvents="box-none" style={styles.row}>
        <View style={styles.brandGroup}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
              onPress={onBack}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={colors.foreground}
              />
            </Pressable>
          ) : null}
          <Text style={styles.brand}>NOIRLENS</Text>
        </View>
        {counter ? <ChipButton label={counter} onPress={onOpenPaywall} /> : null}
      </View>
      <View pointerEvents="box-none" style={styles.tabs}>
        <ModeTabs
          active={active}
          onCamera={onCamera}
          onTranslate={onTranslate}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: layout.page,
    gap: layout.headerTop,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  back: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  pressed: {
    opacity: 0.6,
  },
  brand: {
    ...typography.label,
    color: colors.foreground,
    letterSpacing: 3,
  },
  tabs: {
    alignItems: 'center',
  },
});
