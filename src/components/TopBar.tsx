import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { languageShortLabel } from '@/constants/languages';
import { useSourceLanguage } from '@/services/sourceLanguage';
import { colors, typography } from '@/theme';
import { ChipButton, MicroLabel } from './ui';

export function TopBar({
  active,
  ecoMode,
  onEcoChange,
  remaining,
  unlimited,
  onOpenLanguages,
  onOpenPaywall,
  showNavigation = true,
}: {
  active: boolean;
  ecoMode: boolean;
  onEcoChange: (eco: boolean) => void;
  remaining: number | null;
  unlimited: boolean;
  onOpenLanguages: () => void;
  onOpenPaywall: () => void;
  showNavigation?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const source = useSourceLanguage();
  const counter = unlimited ? 'PRO' : `${remaining ?? 0} LEFT`;
  const sourceLabel =
    source.code === 'auto' ? 'AUTO' : languageShortLabel(source.code);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        <View style={styles.brandGroup}>
          <View style={styles.dot} />
          <Text style={styles.brand}>NOIRLENS</Text>
          <MicroLabel tone="dim" style={styles.offline}>
            OFFLINE READY
          </MicroLabel>
        </View>

        {showNavigation ? (
          <View style={styles.actions}>
            <ChipButton label={sourceLabel} onPress={onOpenLanguages} />
            <ChipButton label={counter} onPress={onOpenPaywall} />
          </View>
        ) : null}
      </View>

      {active ? (
        <View style={styles.ecoRow}>
          <MicroLabel tone="dim">PREVIEW</MicroLabel>
          <ChipButton
            label="NOIR"
            active={ecoMode}
            onPress={() => onEcoChange(true)}
          />
          <ChipButton
            label="COLOR"
            active={!ecoMode}
            onPress={() => onEcoChange(false)}
          />
        </View>
      ) : null}
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
  offline: {
    fontSize: 9,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  ecoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
