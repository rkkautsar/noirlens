import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MicroLabel } from '@/components/ui';
import { TRAVELER_LANGUAGES, type LanguageOption } from '@/constants/languages';
import { colors, typography } from '@/theme';

export const TRANSLATE_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  ...TRAVELER_LANGUAGES,
];

export function LanguagePickerSheet({
  title,
  selected,
  onSelect,
  allowAuto = false,
  travelerOnly = false,
}: {
  title: string;
  selected: string;
  onSelect: (code: string) => void;
  allowAuto?: boolean;
  travelerOnly?: boolean;
}) {
  return (
    <View style={styles.root}>
      <MicroLabel style={styles.heading}>{title}</MicroLabel>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {allowAuto ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selected === 'auto' }}
            onPress={() => onSelect('auto')}
            style={({ pressed }) => [
              styles.row,
              selected === 'auto' && styles.rowActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[styles.name, selected === 'auto' && styles.nameActive]}
            >
              Auto-detect
            </Text>
            <Text
              style={[styles.native, selected === 'auto' && styles.nameActive]}
            >
              OCR's best guess
            </Text>
          </Pressable>
        ) : null}
        {(travelerOnly ? TRAVELER_LANGUAGES : TRANSLATE_LANGUAGES).map((language) => {
          const active = language.code === selected;
          return (
            <Pressable
              key={language.code}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(language.code)}
              style={({ pressed }) => [
                styles.row,
                active && styles.rowActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.name, active && styles.nameActive]}>
                {language.name}
              </Text>
              <Text
                style={[styles.native, active && styles.nameActive]}
                numberOfLines={1}
              >
                {language.nativeName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  root: {
    flex: 1,
    alignSelf: 'stretch',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  rowActive: {
    backgroundColor: colors.accentSoft,
  },
  pressed: {
    opacity: 0.7,
  },
  name: {
    ...typography.body,
    color: colors.foreground,
  },
  native: {
    ...typography.body,
    color: colors.muted,
    marginLeft: 12,
    flexShrink: 1,
  },
  nameActive: {
    color: colors.accent,
  },
});
