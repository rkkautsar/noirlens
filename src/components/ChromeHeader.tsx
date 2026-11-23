import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModeTabs, type AppMode } from './ModeTabs';
import { ChipButton } from './ui';
import { colors, typography } from '@/theme';

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
}: {
  active: AppMode;
  remaining: number | null;
  unlimited: boolean;
  onOpenPaywall: () => void;
  onCamera: () => void;
  onTranslate: () => void;
}) {
  const insets = useSafeAreaInsets();
  const counter = unlimited ? 'PRO' : `${remaining ?? 0} LEFT`;

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        <Text style={styles.brand}>NOIRLENS</Text>
        <ChipButton label={counter} onPress={onOpenPaywall} />
      </View>
      <View style={styles.tabs}>
        <ModeTabs
          active={active}
          inline
          onCamera={onCamera}
          onTranslate={onTranslate}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 20,
    paddingHorizontal: 18,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
