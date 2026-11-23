import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  formatCurrency,
  RATES_AS_OF,
  type PriceConversion,
} from '@/services/currency';
import { colors, typography } from '@/theme';
import { MicroLabel } from './ui';

const CARD_WIDTH = 200;

export function PriceTooltip({
  price,
  locale,
  x,
  y,
  onClose,
}: {
  price: PriceConversion;
  locale: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const left = Math.max(
    12,
    Math.min(x - CARD_WIDTH / 2, width - CARD_WIDTH - 12),
  );
  const below = y + 110 < height;
  const top = below ? y + 18 : y - 96;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable
        accessibilityLabel="Dismiss price"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[styles.card, { left, top, width: CARD_WIDTH }]}
        pointerEvents="box-none"
      >
        <MicroLabel tone="accent">PRICE ESTIMATE</MicroLabel>
        <Text style={styles.line} selectable>
          {price.raw} ≈{' '}
          <Text style={styles.target}>
            {formatCurrency(price.converted, price.target, locale)}
          </Text>
        </Text>
        <MicroLabel tone="dim">
          EST. FX · {price.target} · {RATES_AS_OF}
        </MicroLabel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    backgroundColor: 'rgba(12,12,13,0.97)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  line: {
    ...typography.body,
    color: colors.foreground,
  },
  target: {
    color: colors.success,
    fontWeight: '600',
  },
});
