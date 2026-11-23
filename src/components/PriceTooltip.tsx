import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

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
  // Page coordinates: the modal hosts above every route-level sibling, so the
  // backdrop reliably dismisses before the shutter or top bar can act.
  const { width, height } = useWindowDimensions();
  const cx = Number.isFinite(x) ? x : width / 2;
  const cy = Number.isFinite(y) ? y : height / 2;
  const left = Math.max(
    12,
    Math.min(cx - CARD_WIDTH / 2, Math.max(width - CARD_WIDTH - 12, 12)),
  );
  // Clear the fixed action band near the bottom.
  const below = cy + 110 < height - 190;
  const top = below ? cy + 18 : cy - 96;

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
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
    </Modal>
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
