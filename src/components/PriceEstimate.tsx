import { StyleSheet, Text, View } from 'react-native';

import {
  formatCurrency,
  formatRate,
  RATES_AS_OF,
  type PriceConversion,
} from '@/services/currency';
import { colors, typography } from '@/theme';
import { MicroLabel } from './ui';

export function PriceEstimate({
  rows,
  target,
  locale,
}: {
  rows: PriceConversion[];
  target: string;
  locale: string;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MicroLabel tone="accent">PRICE ESTIMATE</MicroLabel>
        <MicroLabel tone="dim">EST. FX · {target} · {RATES_AS_OF}</MicroLabel>
      </View>

      {rows.map((row) => (
        <View key={`${row.start}-${row.source}-${row.amount}`} style={styles.row}>
          <Text style={styles.line} selectable>
            {row.raw} ≈{' '}
            <Text style={styles.target}>
              {formatCurrency(row.converted, row.target, locale)}
            </Text>
          </Text>
          {row.source !== row.target ? (
            <MicroLabel tone="dim">
              1 {row.source} ≈ {formatRate(row.rate, locale)} {row.target}
            </MicroLabel>
          ) : null}
        </View>
      ))}

      <MicroLabel tone="dim">
        Approximate rate; confirm before paying.
      </MicroLabel>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  row: {
    gap: 3,
  },
  line: {
    ...typography.body,
    color: colors.foreground,
    fontSize: 16,
  },
  target: {
    color: colors.accent,
  },
});
