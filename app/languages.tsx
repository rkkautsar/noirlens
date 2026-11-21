import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetHeader } from '@/components/SheetHeader';
import { Badge, ChipButton, MicroLabel } from '@/components/ui';
import { TRAVELER_LANGUAGES, languageLabel } from '@/constants/languages';
import { colors, typography } from '@/theme';
import vision, {
  type LanguagePackStatus,
} from '../modules/native-vision-translator';

type RowStatus = LanguagePackStatus | 'loading';

export default function LanguagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mounted = useRef(true);

  const [statuses, setStatuses] = useState<Record<string, RowStatus>>(() =>
    Object.fromEntries(
      TRAVELER_LANGUAGES.map((language) => [language.code, 'loading']),
    ),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const entries = await Promise.all(
      TRAVELER_LANGUAGES.map(async (language) => {
        try {
          const result = await vision.checkLanguagePackStatus(language.code);
          return [language.code, result.status] as const;
        } catch {
          return [language.code, 'unsupported'] as const;
        }
      }),
    );
    if (mounted.current) {
      setStatuses(Object.fromEntries(entries));
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const prepare = async (code: string) => {
    if (busy !== null) {
      return;
    }
    setBusy(code);
    setNotice(null);

    try {
      let status = await vision.prepareLanguagePack(code);
      const deadline = Date.now() + 120_000;

      while (
        mounted.current &&
        status.status === 'supported' &&
        Date.now() < deadline
      ) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1500);
        });
        status = await vision.checkLanguagePackStatus(code);
      }

      if (!mounted.current) {
        return;
      }

      setStatuses((previous) => ({ ...previous, [code]: status.status }));
      if (status.status !== 'installed') {
        setNotice(
          `${languageLabel(code)} is still downloading. Tap refresh in a moment.`,
        );
      }
    } catch {
      if (mounted.current) {
        setNotice('The download was cancelled or is unavailable. Try again.');
      }
    } finally {
      if (mounted.current) {
        setBusy(null);
      }
    }
  };

  return (
    <View style={styles.container}>
      <SheetHeader
        title="LANGUAGE PACKS"
        subtitle="CORE APPLE MODELS · ON-DEVICE"
        onClose={() => {
          router.back();
        }}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.noteCard}>
          <MicroLabel tone="accent">ONE-TIME DOWNLOAD</MicroLabel>
          <Text style={styles.noteText}>
            iOS downloads each language model once. After that, scanning and
            translation work with no network, no account and no uploads.
          </Text>
        </View>

        <View style={styles.toolsRow}>
          <MicroLabel tone="dim">
            {refreshing ? 'CHECKING SYSTEM MODELS' : 'TAP TO PREPARE'}
          </MicroLabel>
          <ChipButton
            label={refreshing ? 'CHECKING' : 'REFRESH'}
            onPress={() => {
              void refresh();
            }}
            disabled={refreshing || busy !== null}
          />
        </View>

        <View style={styles.list}>
          {TRAVELER_LANGUAGES.map((language) => {
            const status = statuses[language.code] ?? 'loading';
            const isBusy = busy === language.code;

            return (
              <View key={language.code} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.nativeName}>{language.nativeName}</Text>
                  <MicroLabel tone="dim">
                    {language.name.toUpperCase()} · EN
                  </MicroLabel>
                </View>

                {status === 'loading' ? (
                  <ActivityIndicator size="small" color={colors.dim} />
                ) : status === 'installed' ? (
                  <Badge label="INSTALLED" tone="success" />
                ) : status === 'unsupported' ? (
                  <Badge label="UNAVAILABLE" tone="dim" />
                ) : (
                  <ChipButton
                    label={isBusy ? 'PREPARING' : 'DOWNLOAD'}
                    onPress={() => {
                      void prepare(language.code);
                    }}
                    disabled={busy !== null}
                    active={isBusy}
                  />
                )}
              </View>
            );
          })}
        </View>

        {notice ? (
          <View style={styles.notice}>
            <MicroLabel tone="warning">NOTICE</MicroLabel>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Packs live in iOS Settings. Deleting a pack frees its storage; NoirLens
          will ask again the next time it sees that language.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 18,
  },
  noteCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    backgroundColor: colors.surface,
  },
  noteText: {
    ...typography.body,
    color: colors.muted,
  },
  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  rowText: {
    flexShrink: 1,
    gap: 4,
  },
  nativeName: {
    ...typography.body,
    fontSize: 19,
    color: colors.foreground,
  },
  notice: {
    borderLeftWidth: 2,
    borderLeftColor: colors.warning,
    paddingLeft: 12,
    gap: 6,
  },
  noticeText: {
    ...typography.body,
    color: colors.foreground,
    fontSize: 13,
  },
  footer: {
    ...typography.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.dim,
  },
});
