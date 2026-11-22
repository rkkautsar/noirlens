import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography } from '@/theme';
import { ChipButton, MicroLabel } from './ui';

export function SheetHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: 12 }]}>
      <View style={styles.row}>
        <View style={styles.titles}>
          <Text style={styles.title}>{title}</Text>
          <MicroLabel tone="dim">{subtitle}</MicroLabel>
        </View>
        {onClose ? <ChipButton label="CLOSE" onPress={onClose} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  titles: {
    flexShrink: 1,
    gap: 6,
  },
  title: {
    ...typography.label,
    fontSize: 18,
    letterSpacing: 2.4,
    color: colors.foreground,
  },
});
