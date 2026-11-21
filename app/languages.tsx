import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetHeader } from '@/components/SheetHeader';
import { Badge, ChipButton, MicroLabel } from '@/components/ui';
import { TRAVELER_LANGUAGES, languageLabel } from '@/constants/languages';
import { sourceLanguage, useSourceLanguage } from '@/services/sourceLanguage';
import { colors, typography } from '@/theme';
import vision, {
  type LanguagePackStatus,
} from '../modules/native-vision-translator';

type RowStatus = LanguagePackStatus | 'loading';

export default function LanguagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mounted = useRef(true);
  const selectedSource = useSourceLanguage();

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
        title="LANGUAGES & PACKS"
        subtitle="SCAN SOURCE · OFFLINE MODELS"
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

        <View style={styles.sourceSection}>
          <View style={styles.sectionHeading}>
            <MicroLabel tone="accent">SCAN LANGUAGE</MicroLabel>
            <Text style={styles.sourceHint}>
              Auto uses the sign&apos;s language and never English. Pick a
              language to force it, and download its pack below.
            </Text>
          </View>

          <View style={styles.toolsRow}>
            <MicroLabel tone="dim">
              {refreshing ? 'CHECKING SYSTEM MODELS' : 'PACK STATUS'}
            </MicroLabel>
            <ChipButton
              label={refreshing ? 'CHECKING' : 'REFRESH'}
              onPress={() => {
                void refresh();
              }}
              disabled={refreshing || busy !== null}
            />
          </View>

          <Pressable
            onPress={() => {
              void sourceLanguage.set('auto').catch(() => {});
            }}
            style={[
              styles.sourceRow,
              selectedSource.code === 'auto' && styles.sourceRowActive,
            ]}
          >
            <View
              style={[
                styles.radio,
                selectedSource.code === 'auto' && styles.radioActive,
              ]}
            >
              {selectedSource.code === 'auto' ? (
                <View style={styles.radioDot} />
              ) : null}
            </View>
            <View style={styles.sourceRowText}>
              <Text style={styles.sourceName}>AUTO</Text>
              <MicroLabel tone="dim">DETECT THE SIGN · NEVER ENGLISH</MicroLabel>
            </View>
            {selectedSource.code === 'auto' ? (
              <Badge label="SOURCE" tone="accent" />
            ) : null}
          </Pressable>

          {TRAVELER_LANGUAGES.map((language) => {
            const status = statuses[language.code] ?? 'loading';
            const isBusy = busy === language.code;
            const isSelected = selectedSource.code === language.code;

            return (
              <View
                key={language.code}
                style={[styles.sourceRow, isSelected && styles.sourceRowActive]}
              >
                <Pressable
                  style={styles.selectArea}
                  onPress={() => {
                    void sourceLanguage.set(language.code).catch(() => {});
                  }}
                >
                  <View
                    style={[styles.radio, isSelected && styles.radioActive]}
                  >
                    {isSelected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <View style={styles.sourceRowText}>
                    <Text style={styles.sourceName}>{language.nativeName}</Text>
                    <MicroLabel tone="dim">
                      {language.name.toUpperCase()} · EN
                    </MicroLabel>
                  </View>
                </Pressable>

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
  sourceSection: {
    gap: 8,
  },
  sectionHeading: {
    gap: 4,
    marginBottom: 4,
  },
  sourceHint: {
    ...typography.body,
    color: colors.muted,
    fontSize: 12,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 12,
  },
  sourceRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  selectArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sourceRowText: {
    flex: 1,
    gap: 3,
  },
  sourceName: {
    ...typography.body,
    fontSize: 16,
    color: colors.foreground,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.dim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: colors.accent,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  packsLabel: {
    marginTop: 4,
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
