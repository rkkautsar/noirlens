import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { AppSheet } from '@/components/AppSheet';
import { LanguagePickerSheet } from '@/components/LanguagePickerSheet';
import { LanguagesSheet } from '@/components/LanguagesSheet';
import { LookupSheet } from '@/components/LookupSheet';
import { ModeTabs } from '@/components/ModeTabs';
import { ResultCard } from '@/components/ResultCard';
import { ScanlineOverlay } from '@/components/ScanlineOverlay';
import { TopBar } from '@/components/TopBar';
import { ChipButton, MicroLabel } from '@/components/ui';
import {
  isEnglishLanguageCode,
  languageLabel,
  languageShortLabel,
} from '@/constants/languages';
import type { ScanResult } from '@/scanner/machine';
import { captures, useCaptures } from '@/services/captures';
import { rerunCaptureOcr, retryCapture } from '@/services/captureProcessing';
import {
  describeNativeError,
  isLanguagePackFailure,
} from '@/services/nativeErrors';
import vision from '../../modules/native-vision-translator';
import { colors, radius, spacing, typography } from '@/theme';

type Overlay =
  | { kind: 'lookup'; q: string; alt?: string }
  | { kind: 'languages' }
  | { kind: 'languagePicker' }
  | null;

export default function CaptureDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { records } = useCaptures();
  const record = records.find((row) => row.id === id);

  useEffect(() => {
    void captures.hydrate();
  }, []);
  const { width } = useWindowDimensions();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [languageBusy, setLanguageBusy] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [entry, setEntry] = useState<ScanResult | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number>(-1);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [entryY, setEntryY] = useState<number | null>(null);
  const requestRef = useRef(0);
  const lastRequest = useRef<{ index: number | null } | null>(null);

  const busy =
    languageBusy ||
    record?.status === 'pending' ||
    record?.status === 'processing';

  useEffect(() => {
    if (record?.status === 'done' || record?.status === 'failed') {
      setLanguageBusy(false);
    }
  }, [record?.status]);

  useEffect(() => {
    if (entry && entryY !== null) {
      scrollRef.current?.scrollTo({
        y: Math.max(0, entryY - 72),
        animated: true,
      });
    }
  }, [entry, entryY]);

  // A different capture invalidates the inline translation.
  useEffect(() => {
    requestRef.current += 1;
    setEntry(null);
    setTranslating(false);
    lastRequest.current = null;
  }, [id]);

  if (!record) {
    return (
      <View style={styles.page}>
        <View style={styles.empty}>
          <MicroLabel tone="dim">CAPTURE NOT FOUND</MicroLabel>
          <Pressable onPress={() => router.replace('/')} style={styles.textButton}>
            <Text style={styles.textButtonLabel}>BACK TO CAMERA</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const imageWidth = Math.min(width - spacing.lg * 2, 620);
  const imageHeight = imageWidth * (record.height / record.width);
  const hasText = record.status === 'done' && record.text.length > 0;
  const canTranslate = hasText && !busy;
  const title = languageLabel(record.language || record.hint);

  const runTranslation = async (index: number | null) => {
    if (!record || !canTranslate) {
      return;
    }
    const block = index !== null ? record.blocks[index] : undefined;
    if (index !== null && !block) {
      return;
    }
    const text = (block?.text ?? record.text).trim();
    if (!text) {
      return;
    }
    const sourceLanguage = record.language || record.hint || 'und';
    const base: ScanResult = {
      kind: 'translated',
      sourceText: text,
      translatedText: '',
      sourceLanguage,
      sourceHash: record.id,
      blocks: index !== null && block ? [block] : record.blocks,
      imageWidth: record.width,
      imageHeight: record.height,
      cached: false,
    };
    const token = requestRef.current + 1;
    requestRef.current = token;
    lastRequest.current = { index };
    setTranslating(true);
    setTranslateError(null);
    setEntry(null);
    try {
      if (isEnglishLanguageCode(sourceLanguage)) {
        setEntry({ ...base, kind: 'english', translatedText: '' });
        return;
      }
      const out = await vision.translate({
        text,
        sourceLanguage,
        targetLanguage: 'en',
      });
      if (token !== requestRef.current) {
        return;
      }
      setEntry({ ...base, kind: 'translated', translatedText: out.translatedText });
    } catch (error) {
      if (token !== requestRef.current) {
        return;
      }
      if (isLanguagePackFailure(error)) {
        setEntry({ ...base, kind: 'pack_missing', translatedText: '' });
      } else {
        setTranslateError(describeNativeError(error).message);
      }
    } finally {
      if (token === requestRef.current) {
        setTranslating(false);
      }
    }
  };

  const chooseLanguage = (code: string) => {
    setOverlay(null);
    const next = code === 'auto' ? '' : code;
    if (!record || next === record.hint) {
      return;
    }
    setLanguageBusy(true);
    setLanguageError(null);
    requestRef.current += 1;
    setEntry(null);
    setTranslating(false);
    lastRequest.current = null;
    void rerunCaptureOcr(record.id, next)
      .catch(() => {
        setLanguageError('Could not change the OCR language. Try again.');
      })
      .finally(() => {
        setLanguageBusy(false);
      });
  };

  const openLanguagePicker = () => {
    if (busy) {
      return;
    }
    setOverlay({ kind: 'languagePicker' });
  };

  const closeLanguages = () => {
    const retry = entry?.kind === 'pack_missing' ? lastRequest.current : null;
    setOverlay(null);
    if (retry) {
      void runTranslation(retry.index);
    }
  };

  return (
    <View style={styles.page}>
      <TopBar
        remaining={null}
        unlimited
        onOpenPaywall={() => {}}
        showNavigation={false}
      />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <ModeTabs
          inline
          active="camera"
          onCamera={() => router.replace('/')}
          onTranslate={() => router.push('/translate')}
        />

        <View style={[styles.imageWrap, { width: imageWidth, height: imageHeight }]}>
          <Image
            source={{ uri: captures.uriFor(record.thumb) }}
            style={{ width: imageWidth, height: imageHeight }}
            resizeMode="contain"
            onError={() => setImageFailed(true)}
          />
          <ScanlineOverlay />
          {record.status === 'done'
            ? record.blocks.map((block, index) => {
                const active = selected === index;
                return (
                  <Pressable
                    key={`${index}-${block.text.slice(0, 8)}`}
                    style={[
                      styles.box,
                      {
                        left: `${block.x * 100}%`,
                        top: `${block.y * 100}%`,
                        width: `${block.width * 100}%`,
                        height: `${block.height * 100}%`,
                      },
                      active && styles.boxActive,
                      busy && styles.boxDisabled,
                    ]}
                    onPress={() => {
                      if (!canTranslate) {
                        return;
                      }
                      setSelected(index);
                      void runTranslation(index);
                    }}
                  >
                    <Text style={styles.boxLabel}>{index + 1}</Text>
                  </Pressable>
                );
              })
            : null}
          {imageFailed ? (
            <View style={styles.imageFallback}>
              <Text style={styles.imageFallbackText}>
                IMAGE NO LONGER AVAILABLE
              </Text>
            </View>
          ) : null}
        </View>

        {translating ? (
          <View style={styles.translating}>
            <ActivityIndicator color={colors.accent} />
            <MicroLabel tone="accent">TRANSLATING…</MicroLabel>
          </View>
        ) : null}

        {entry ? (
          <View onLayout={(event) => setEntryY(event.nativeEvent.layout.y)}>
          <ResultCard
            embedded
            readOnly
            result={entry}
            remaining={null}
            unlimited
            onScanAgain={() => {
              setEntry(null);
              setSelected(-1);
              lastRequest.current = null;
            }}
            onOpenLanguages={() => setOverlay({ kind: 'languages' })}
            onLookUp={(phrase, alt) => {
              const q = phrase.trim();
              if (q) {
                setOverlay({ kind: 'lookup', q, alt });
              }
            }}
          />
          </View>
        ) : null}

        {translateError ? (
          <View style={styles.errorPanel}>
            <MicroLabel tone="danger">TRANSLATION FAILED</MicroLabel>
            <Text style={styles.errorText}>{translateError}</Text>
            <ChipButton
              label="RETRY"
              icon="refresh"
              onPress={() => runTranslation(lastRequest.current?.index ?? null)}
            />
          </View>
        ) : null}

        {languageError ? (
          <View style={styles.errorPanel}>
            <MicroLabel tone="danger">OCR LANGUAGE</MicroLabel>
            <Text style={styles.errorText}>{languageError}</Text>
          </View>
        ) : null}

        <View style={styles.languagePanel}>
          <MicroLabel>{title.toUpperCase()}</MicroLabel>
          <View style={styles.languagePill}>
            <ChipButton
              label={
                busy && record.status !== 'failed'
                  ? `${languageShortLabel(record.language || record.hint)} · OCR…`
                  : languageShortLabel(record.language || record.hint)
              }
              icon="language-outline"
              active
              disabled={busy}
              onPress={openLanguagePicker}
            />
          </View>
          <View style={styles.panelSpacer} />
          <ChipButton
            label="TRANSLATE ALL"
            icon="sparkles"
            active={canTranslate}
            disabled={!canTranslate}
            onPress={() => void runTranslation(null)}
          />
        </View>

        {record.status === 'failed' ? (
          <View style={styles.stateBlock}>
            <MicroLabel tone="danger">OCR FAILED</MicroLabel>
            <Text style={styles.stateText}>
              {record.error || 'The text could not be read.'}
            </Text>
            <ChipButton
              label="RETRY OCR"
              icon="refresh"
              active
              onPress={() => void retryCapture(record.id)}
            />
          </View>
        ) : record.status === 'done' && !record.text.trim() ? (
          <View style={styles.stateBlock}>
            <MicroLabel tone="dim">NO TEXT FOUND</MicroLabel>
            <Text style={styles.stateText}>
              Tap the OCR language above if it misread the characters.
            </Text>
          </View>
        ) : record.status === 'done' ? (
          <View style={styles.blocks}>
            <MicroLabel tone="dim">DETECTED TEXT</MicroLabel>
            {record.blocks.slice(0, 12).map((block, index) => (
              <Text key={`${index}-${block.text.slice(0, 6)}`} style={styles.block} numberOfLines={2}>
                {block.text}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerMeta}>
            {new Date(record.at).toLocaleString()}
          </Text>
          <ChipButton
            label="DELETE CAPTURE"
            icon="trash-outline"
            onPress={() => void captures.remove(record.id)}
          />
        </View>
      </ScrollView>

      <AppSheet
        visible={overlay !== null}
        onClose={() => {
          if (overlay?.kind === 'languages') {
            closeLanguages();
          } else {
            setOverlay(null);
          }
        }}
      >
        {overlay?.kind === 'lookup' ? (
          <LookupSheet
            q={overlay.q}
            alt={overlay.alt}
            onClose={() => setOverlay(null)}
          />
        ) : overlay?.kind === 'languages' ? (
          <LanguagesSheet onClose={closeLanguages} />
        ) : overlay?.kind === 'languagePicker' ? (
          <LanguagePickerSheet
            title="OCR LANGUAGE"
            selected={record.hint}
            allowAuto
            onSelect={(code) => {
              chooseLanguage(code);
            }}
          />
        ) : null}
      </AppSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: 72,
    paddingBottom: 120,
    gap: spacing.lg,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  textButton: {
    paddingVertical: 8,
  },
  textButtonLabel: {
    ...typography.micro,
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 2,
  },
  imageWrap: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: colors.border,
  },
  box: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  boxActive: {
    borderColor: colors.accent,
  },
  boxDisabled: {
    opacity: 0.5,
  },
  boxLabel: {
    ...typography.micro,
    color: colors.muted,
    fontSize: 9,
    paddingHorizontal: 3,
  },
  imageFallback: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackText: {
    ...typography.micro,
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 1.6,
  },
  translating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  errorPanel: {
    gap: 8,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  errorText: {
    ...typography.body,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  languagePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  languagePill: {
    flexShrink: 1,
  },
  panelSpacer: {
    flex: 1,
  },
  stateBlock: {
    gap: 8,
    paddingVertical: 12,
  },
  stateText: {
    ...typography.body,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  blocks: {
    gap: 8,
  },
  block: {
    ...typography.body,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  footerMeta: {
    ...typography.micro,
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1.2,
  },
});
