import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography } from '@/theme';
import { ChipButton, FilterToggle } from './ui';

export function TopBar({
  ecoMode,
  onEcoChange,
  remaining,
  unlimited,
  onOpenPaywall,
  showNavigation = true,
}: {
  ecoMode: boolean;
  onEcoChange: (eco: boolean) => void;
  remaining: number | null;
  unlimited: boolean;
  onOpenPaywall: () => void;
  showNavigation?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const counter = unlimited ? 'PRO' : `${remaining ?? 0} LEFT`;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        <View style={styles.brandGroup}>
          <View style={styles.dot} />
          <Text style={styles.brand}>NOIRLENS</Text>
        </View>

        {showNavigation ? (
          <View style={styles.actions}>
            <ChipButton label={counter} onPress={onOpenPaywall} />
          </View>
        ) : null}
      </View>

      <FilterToggle ecoMode={ecoMode} onChange={onEcoChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.72)',
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
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  brand: {
    ...typography.label,
    color: colors.foreground,
    letterSpacing: 2.4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
});
