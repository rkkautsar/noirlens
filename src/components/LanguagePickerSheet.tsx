import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MicroLabel } from '@/components/ui';
import { TRAVELER_LANGUAGES, type LanguageOption } from '@/constants/languages';
import { colors, typography } from '@/theme';
import vision, {
  type LanguagePackStatus,
} from '../../modules/native-vision-translator';

export const TRANSLATE_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  ...TRAVELER_LANGUAGES,
];

type RowStatus = LanguagePackStatus | 'loading';

export function LanguagePickerSheet({
  title,
  selected,
  onSelect,
  allowAuto = false,
  travelerOnly = false,
  packTarget,
}: {
  title: string;
  selected: string;
  onSelect: (code: string) => void;
  allowAuto?: boolean;
  travelerOnly?: boolean;
  /** When set, rows show and gate on the translation pack for this pair. */
  packTarget?: string;
}) {
  const options = travelerOnly ? TRAVELER_LANGUAGES : TRANSLATE_LANGUAGES;
  const mounted = useRef(true);
  const requestToken = useRef(0);
  const packRequest = useRef<string | null>(null);

  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!packTarget) {
      return;
    }
    try {
      const results = await vision.checkLanguagePackStatuses(
        options.map((language) => language.code),
        packTarget,
      );
      if (!mounted.current) {
        return;
      }
      setStatuses(
        Object.fromEntries(results.map((result) => [result.language, result.status])),
      );
    } catch {
      if (mounted.current) {
        setStatuses(
          Object.fromEntries(
            options.map((language) => [language.code, 'unsupported']),
          ),
        );
      }
    }
  }, [options, packTarget]);

  useEffect(() => {
    mounted.current = true;
    if (packTarget) {
      setStatuses(
        Object.fromEntries(options.map((language) => [language.code, 'loading'])),
      );
      void refresh();
    }
    return () => {
      mounted.current = false;
      requestToken.current += 1;
      const request = packRequest.current;
      packRequest.current = null;
      if (request !== null) {
        void vision.cancelLanguagePack(request).catch(() => {});
      }
    };
  }, [options, packTarget, refresh]);

  const prepare = async (code: string) => {
    if (!packTarget || busy !== null) {
      return;
    }
    const token = requestToken.current + 1;
    requestToken.current = token;
    const requestId = `picker-pack-${Date.now()}-${token}`;
    packRequest.current = requestId;
    setBusy(code);
    setNotice(null);

    try {
      let status = await vision.prepareLanguagePack(
        code,
        packTarget,
        requestId,
      );
      const deadline = Date.now() + 120_000;
      while (
        mounted.current &&
        token === requestToken.current &&
        status.status === 'supported' &&
        Date.now() < deadline
      ) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1500);
        });
        if (!mounted.current || token !== requestToken.current) {
          return;
        }
        status = await vision.checkLanguagePackStatus(code, packTarget);
      }
      if (!mounted.current || token !== requestToken.current) {
        return;
      }
      setStatuses((previous) => ({ ...previous, [code]: status.status }));
      if (status.status === 'installed') {
        onSelect(code);
      } else if (status.status !== 'cancelled') {
        setNotice('The pack did not finish installing. Tap the language again.');
      }
    } catch {
      if (mounted.current && token === requestToken.current) {
        setNotice('The download was cancelled or is unavailable. Try again.');
      }
    } finally {
      if (packRequest.current === requestId) {
        packRequest.current = null;
      }
      if (mounted.current && token === requestToken.current) {
        setBusy(null);
      }
    }
  };

  return (
    <View style={styles.root}>
      <MicroLabel style={styles.heading}>{title}</MicroLabel>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
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
              OCR&apos;s best guess
            </Text>
          </Pressable>
        ) : null}
        {options.map((language) => {
          const active = language.code === selected;
          const status = packTarget
            ? (statuses[language.code] ?? 'loading')
            : null;
          const unavailable = status === 'unsupported' || status === 'loading';
          const downloading = busy === language.code;
          return (
            <Pressable
              key={language.code}
              accessibilityRole="button"
              accessibilityState={{
                selected: active,
                disabled: unavailable || (busy !== null && !downloading),
                busy: downloading,
              }}
              accessibilityLabel={
                status === 'installed'
                  ? `${language.name}, installed`
                  : status === 'supported'
                    ? `${language.name}, download required`
                    : status === 'unsupported'
                      ? `${language.name}, unavailable`
                      : language.name
              }
              disabled={unavailable || (busy !== null && !downloading)}
              onPress={() => {
                if (status === null || status === 'installed') {
                  onSelect(language.code);
                } else if (status === 'supported' || status === 'cancelled') {
                  void prepare(language.code);
                }
              }}
              style={({ pressed }) => [
                styles.row,
                active && styles.rowActive,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.identity}>
                <Text style={[styles.name, active && styles.nameActive]}>
                  {language.name}
                </Text>
                <Text
                  style={[styles.native, active && styles.nameActive]}
                  numberOfLines={1}
                >
                  {language.nativeName}
                </Text>
              </View>
              {downloading || status === 'loading' ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : status === 'supported' ? (
                <View style={styles.download}>
                  <Text style={styles.downloadText}>DOWNLOAD</Text>
                </View>
              ) : status === 'unsupported' ? (
                <Text style={styles.unavailable}>UNAVAILABLE</Text>
              ) : status === 'installed' && active ? (
                <Text style={styles.ready}>ACTIVE</Text>
              ) : status === 'installed' ? (
                <Text style={styles.ready}>READY</Text>
              ) : null}
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
  notice: {
    ...typography.micro,
    color: colors.warning,
    lineHeight: 16,
    paddingHorizontal: 16,
    paddingBottom: 10,
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
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
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
  ready: {
    ...typography.micro,
    color: colors.muted,
    letterSpacing: 0.8,
    marginLeft: 12,
  },
  unavailable: {
    ...typography.micro,
    color: colors.dim,
    letterSpacing: 0.8,
    marginLeft: 12,
  },
  download: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 12,
  },
  downloadText: {
    ...typography.micro,
    color: colors.accent,
    letterSpacing: 0.8,
  },
});
