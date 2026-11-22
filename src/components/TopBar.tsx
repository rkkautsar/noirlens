import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography } from '@/theme';
import { ChipButton } from './ui';

export function TopBar({
  remaining,
  unlimited,
  onOpenPaywall,
  showNavigation = true,
}: {
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
          <Text style={styles.brand}>NOIRLENS</Text>
        </View>

        {showNavigation ? (
          <View style={styles.actions}>
            <ChipButton label={counter} onPress={onOpenPaywall} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 10,
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
  brand: {
    ...typography.label,
    color: colors.foreground,
    letterSpacing: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
});
