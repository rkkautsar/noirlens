import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PriceEstimate } from '@/components/PriceEstimate';
import { SheetHeader } from '@/components/SheetHeader';
import { SolidButton } from '@/components/ui';
import { type PriceConversion } from '@/services/currency';
import { preferredCurrency } from '@/services/localeCurrency';
import { colors } from '@/theme';

export default function PricesScreen() {
  const router = useRouter();
  const { rows } = useLocalSearchParams<{ rows?: string }>();
  const preferred = preferredCurrency();

  let prices: PriceConversion[] = [];
  if (typeof rows === 'string' && rows) {
    try {
      const parsed: unknown = JSON.parse(rows);
      if (Array.isArray(parsed)) {
        prices = parsed.filter(
          (row): row is PriceConversion =>
            typeof row === 'object' &&
            row !== null &&
            typeof (row as PriceConversion).raw === 'string' &&
            typeof (row as PriceConversion).converted === 'number',
        );
      }
    } catch {
      prices = [];
    }
  }

  return (
    <View style={styles.screen}>
      <SheetHeader title="PRICES" subtitle={`EST. FX · ${preferred.code}`} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <PriceEstimate
          rows={prices}
          target={prices[0]?.target ?? preferred.code}
          locale={preferred.locale}
        />
      </ScrollView>
      <View style={styles.footer}>
        <SolidButton
          label="CLOSE"
          icon="close"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/preview');
            }
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
