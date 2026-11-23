import { ScrollView, StyleSheet, View } from 'react-native';

import { PriceEstimate } from '@/components/PriceEstimate';
import { SheetHeader } from '@/components/SheetHeader';
import { SolidButton } from '@/components/ui';
import { type PriceConversion } from '@/services/currency';
import { preferredCurrency } from '@/services/localeCurrency';
import { colors } from '@/theme';

export function PricesSheet({
  rows,
  selectedStart,
  onClose,
}: {
  rows: PriceConversion[];
  selectedStart?: number;
  onClose: () => void;
}) {
  const preferred = preferredCurrency();
  const prices = rows;

  return (
    <View style={styles.screen}>
      <SheetHeader title="PRICES" subtitle={`EST. FX · ${preferred.code}`} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <PriceEstimate
          rows={prices}
          target={prices[0]?.target ?? preferred.code}
          locale={preferred.locale}
          selectedStart={selectedStart}
        />
      </ScrollView>
      <View style={styles.footer}>
        <SolidButton label="CLOSE" icon="close" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
});
