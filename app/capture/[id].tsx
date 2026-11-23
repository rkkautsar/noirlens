import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguagePickerSheet } from '@/components/LanguagePickerSheet';
import { ModeTabs } from '@/components/ModeTabs';
import { OverlaySheet } from '@/components/OverlaySheet';
import { ScanlineOverlay } from '@/components/ScanlineOverlay';
import { ChipButton, MicroLabel } from '@/components/ui';
import {
  languageLabel,
  languageShortLabel,
} from '@/constants/languages';
import { captures, useCaptures } from '@/services/captures';
import {
  rerunCaptureOcr,
  retryCapture,
} from '@/services/captureProcessing';
import { romanize } from '@/services/romanize';
import { romanizeNative } from '@/services/romanizeNative';
import { describeTranslateFailure } from '@/services/translateRequest';
import { colors, radius, typography } from '@/theme';
import vision from '../../modules/native-vision-translator';

interface TranslationState {
  status: 'idle' | 'loading' | 'done' | 'error';
  text: string;
  error: string;
  packGap: boolean;
}

const IDLE: TranslationState = {
  status: 'idle',
  text: '',
  error: '',
  packGap: false,
};

function formatTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** JS tables first, then the native ICU pass when it has a different answer. */
function useRomanized(text: string, language: string): string {
  const [state, setState] = useState({ text, language, value: '' });
  useEffect(() => {
    let active = true;
    setState({ text, language, value: romanize(text) });
    if (text.trim().length === 0) {
      return;
    }
    void romanizeNative(text, language)
      .then((value) => {
        if (active) {
          setState({ text, language, value });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [text, language]);
  return state.text === text && state.language === language
    ? state.value
    : romanize(text);
}

function isDifferentRomanization(value: string, source: string): boolean {
  return (
    value.trim().length > 0 &&
    value.trim().toLowerCase() !== source.trim().toLowerCase()
  );
}

export default function CaptureDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const state = useCaptures();
  const record = state.records.find((entry) => entry.id === id);

  const [selected, setSelected] = useState<number | null>(null);
  const [region, setRegion] = useState<TranslationState>(IDLE);
  const [all, setAll] = useState<TranslationState>(IDLE);
  const [copied, setCopied] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [picker, setPicker] = useState(false);
  const regionRequest = useRef(0);
  const allRequest = useRef(0);
  const reviewed = useRef(false);

  useEffect(() => {
    void captures.hydrate();
  }, []);

  useEffect(() => {
    if (!record || record.reviewedAt !== null || reviewed.current) {
      return;
    }
    reviewed.current = true;
    void captures.review(id);
  }, [id, record]);

  // A language change re-runs OCR; drop results tied to the previous pass.
  useEffect(() => {
    setSelected(null);
    setRegion(IDLE);
    setAll(IDLE);
  }, [record?.hint, record?.text]);

  const hint = record?.hint ?? '';
  const source = record?.language || hint || 'en';
  const busy =
    record?.status === 'pending' || record?.status === 'processing';
  const block = selected !== null ? record?.blocks[selected] : undefined;
  const romanizedWhole = useRomanized(record?.text ?? '', source);
  const romanizedBlock = useRomanized(block?.text ?? '', source);

  const copy = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(key);
    setTimeout(() => {
      setCopied((current) => (current === key ? null : current));
    }, 1400);
  };

  const runTranslate = async (
    text: string,
    set: (value: TranslationState) => void,
    requests: { current: number },
    token: number,
  ) => {
    if (!record || text.trim().length === 0) {
      return;
    }
    set({ status: 'loading', text: '', error: '', packGap: false });
    try {
      const out = await vision.translate({
        text,
        sourceLanguage: source,
        targetLanguage: 'en',
      });
      if (token !== requests.current) {
        return;
      }
      set({
        status: 'done',
        text: out.translatedText,
        error: '',
        packGap: false,
      });
    } catch (error) {
      if (token !== requests.current) {
        return;
      }
      const failure = describeTranslateFailure(error, source, 'en');
      set({
        status: 'error',
        text: '',
        error: failure.message,
        packGap: failure.packGap,
      });
    }
  };

  const translate = (
    text: string,
    set: (value: TranslationState) => void,
    requests: { current: number },
  ) => {
    const token = requests.current + 1;
    requests.current = token;
    return runTranslate(text, set, requests, token);
  };

  const preparePack = async (
    text: string,
    set: (value: TranslationState) => void,
    requests: { current: number },
  ) => {
    const token = requests.current + 1;
    requests.current = token;
    set({ status: 'loading', text: '', error: '', packGap: false });
    try {
      const status = await vision.prepareLanguagePack(source, 'en');
      if (token !== requests.current) {
        return;
      }
      if (status.status === 'installed') {
        await runTranslate(text, set, requests, token);
        return;
      }
      set({
        status: 'error',
        text: '',
        error: 'The offline pack did not finish installing. Try again.',
        packGap: true,
      });
    } catch (error) {
      if (token !== requests.current) {
        return;
      }
      const failure = describeTranslateFailure(error, source, 'en');
      set({
        status: 'error',
        text: '',
        error: failure.message,
        packGap: failure.packGap,
      });
    }
  };

  const selectBlock = (index: number) => {
    if (!record) {
      return;
    }
    setSelected(index);
    const next = record.blocks[index];
    if (next) {
      void translate(next.text, setRegion, regionRequest);
    }
  };

  const chooseLanguage = (code: string) => {
    setPicker(false);
    if (!record) {
      return;
    }
    const next = code === 'auto' ? '' : code;
    if (next === record.hint) {
      return;
    }
    rerunCaptureOcr(record.id, next);
  };

  const remove = () => {
    if (!record) {
      return;
    }
    Alert.alert(
      'Delete capture?',
      'The image and its recognized text are removed from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void captures.remove(record.id).then(() => router.back());
          },
        },
      ],
    );
  };

  const header = (
    <View
      style={[
        styles.headerWrap,
        { paddingTop: insets.top + 8, paddingBottom: 8 },
      ]}
    >
      <View style={styles.headerRow}>
        <ChipButton
          label="Back"
          icon="chevron-back"
          iconOnly
          onPress={() => router.back()}
        />
        <MicroLabel tone="dim">
          {record ? formatTime(record.at) : 'NOT FOUND'}
        </MicroLabel>
        {record ? (
          <ChipButton
            label="Delete capture"
            icon="trash-outline"
            iconOnly
            onPress={remove}
          />
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>
      <ModeTabs
        inline
        active="camera"
        onCamera={() => router.back()}
        onTranslate={() => router.push('/translate')}
      />
    </View>
  );

  if (!state.loaded) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.center}>
          <MicroLabel tone="dim">CAPTURE NOT FOUND</MicroLabel>
          <Text style={styles.emptyText}>
            It was deleted or its image is no longer on this device.
          </Text>
        </View>
      </View>
    );
  }

  const imageWidth = width - 32;
  const imageHeight = Math.max(
    120,
    imageWidth * (record.height / Math.max(1, record.width)),
  );

  const translated = (value: TranslationState) =>
    value.status === 'loading'
      ? 'Translating…'
      : value.status === 'error'
        ? value.error
        : value.text;

  return (
    <View style={styles.root}>
      {header}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <View
          style={[
            styles.imageWrap,
            { width: imageWidth, height: imageHeight },
          ]}
        >
          <Image
            source={{ uri: captures.uriFor(record.image) }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
          {!imageFailed ? <ScanlineOverlay /> : null}
          {imageFailed ? (
            <View style={styles.missingImage}>
              <Ionicons name="image-outline" size={22} color={colors.dim} />
              <MicroLabel tone="dim">IMAGE UNAVAILABLE</MicroLabel>
            </View>
          ) : null}
          {record.status === 'done'
            ? record.blocks.map((entry, index) => (
                <Pressable
                  key={`${index}-${entry.text}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Translate ${entry.text}`}
                  hitSlop={6}
                  onPress={() => selectBlock(index)}
                  style={[
                    styles.block,
                    {
                      left: entry.x * imageWidth,
                      top: entry.y * imageHeight,
                      width: Math.max(entry.width * imageWidth, 18),
                      height: Math.max(entry.height * imageHeight, 12),
                    },
                    selected === index && styles.blockActive,
                  ]}
                />
              ))
            : null}
          {busy ? (
            <View style={styles.processing}>
              <ActivityIndicator color={colors.accent} />
              <MicroLabel>READING TEXT ON-DEVICE…</MicroLabel>
            </View>
          ) : null}
        </View>

        {record.status === 'failed' ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {record.error || 'Text recognition failed.'}
            </Text>
            <ChipButton
              label="Retry text recognition"
              icon="refresh"
              iconOnly
              onPress={() => retryCapture(record.id)}
            />
          </View>
        ) : null}

        {record.status === 'done' && record.text.length === 0 ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>No text was recognized.</Text>
          </View>
        ) : null}

        {record.text.length > 0 ? (
          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`OCR language: ${
                  hint ? languageLabel(hint) : 'Auto-detect'
                }. Change language and read again.`}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => setPicker(true)}
                style={({ pressed }) => [
                  styles.languagePill,
                  busy && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="language-outline"
                  size={14}
                  color={colors.accent}
                />
                <Text style={styles.languagePillText}>
                  {hint ? languageShortLabel(hint) : 'AUTO'}
                </Text>
                <Ionicons name="chevron-down" size={12} color={colors.muted} />
              </Pressable>
              <ChipButton
                label="Translate all text"
                icon="language-outline"
                iconOnly
                onPress={() => void translate(record.text, setAll, allRequest)}
              />
            </View>

            {block ? (
              <View style={styles.region}>
                <MicroLabel tone="accent">SELECTED REGION</MicroLabel>
                <Text
                  selectable
                  style={[
                    styles.translationText,
                    region.status === 'error' && styles.errorText,
                  ]}
                >
                  {translated(region)}
                </Text>
                {isDifferentRomanization(romanizedBlock, block.text) ? (
                  <Text style={styles.romanizedText} selectable>
                    {romanizedBlock}
                  </Text>
                ) : null}
                <Text style={styles.sourceText} selectable>
                  {block.text}
                </Text>
                <View style={styles.regionActions}>
                  {region.status === 'done' ? (
                    <ChipButton
                      label={
                        copied === 'region-out'
                          ? 'Copied translation'
                          : 'Copy translation'
                      }
                      icon={copied === 'region-out' ? 'checkmark' : 'copy-outline'}
                      iconOnly
                      active={copied === 'region-out'}
                      onPress={() => void copy(region.text, 'region-out')}
                    />
                  ) : null}
                  <ChipButton
                    label={
                      copied === 'region-src'
                        ? 'Copied text'
                        : 'Copy recognized text'
                    }
                    icon={
                      copied === 'region-src'
                        ? 'checkmark'
                        : 'document-text-outline'
                    }
                    iconOnly
                    active={copied === 'region-src'}
                    onPress={() => void copy(block.text, 'region-src')}
                  />
                  {region.status === 'error' && region.packGap ? (
                    <ChipButton
                      label="Download language pack"
                      icon="download-outline"
                      iconOnly
                      onPress={() =>
                        void preparePack(block.text, setRegion, regionRequest)
                      }
                    />
                  ) : null}
                </View>
              </View>
            ) : (
              <Text style={styles.hint}>
                Tap a highlighted region on the image to translate it, or
                translate the whole capture.
              </Text>
            )}

            {all.status !== 'idle' ? (
              <View style={styles.region}>
                <MicroLabel tone="accent">WHOLE CAPTURE</MicroLabel>
                <Text
                  selectable
                  style={[
                    styles.translationText,
                    all.status === 'error' && styles.errorText,
                  ]}
                >
                  {translated(all)}
                </Text>
                {isDifferentRomanization(romanizedWhole, record.text) ? (
                  <Text style={styles.romanizedText} selectable>
                    {romanizedWhole}
                  </Text>
                ) : null}
                <Text style={styles.sourceText} selectable>
                  {record.text}
                </Text>
                <View style={styles.regionActions}>
                  {all.status === 'done' ? (
                    <ChipButton
                      label={
                        copied === 'all-out'
                          ? 'Copied translation'
                          : 'Copy translation'
                      }
                      icon={copied === 'all-out' ? 'checkmark' : 'copy-outline'}
                      iconOnly
                      active={copied === 'all-out'}
                      onPress={() => void copy(all.text, 'all-out')}
                    />
                  ) : null}
                  {all.status === 'error' && all.packGap ? (
                    <ChipButton
                      label="Download language pack"
                      icon="download-outline"
                      iconOnly
                      onPress={() =>
                        void preparePack(record.text, setAll, allRequest)
                      }
                    />
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {picker ? (
        <OverlaySheet onClose={() => setPicker(false)}>
          <LanguagePickerSheet
            title="OCR LANGUAGE"
            selected={hint || 'auto'}
            allowAuto
            onSelect={chooseLanguage}
          />
        </OverlaySheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerWrap: {
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerSpacer: {
    width: 38,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 32,
  },
  emptyText: {
    ...typography.body,
    color: colors.muted,
    textAlign: 'center',
  },
  imageWrap: {
    position: 'relative',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  missingImage: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surfaceRaised,
  },
  block: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(217,179,108,0.55)',
    backgroundColor: 'rgba(217,179,108,0.06)',
    borderRadius: 3,
  },
  blockActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(217,179,108,0.22)',
  },
  processing: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 14,
  },
  noticeText: {
    ...typography.body,
    color: colors.muted,
    flex: 1,
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 14,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  languagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  languagePillText: {
    ...typography.micro,
    color: colors.foreground,
  },
  region: {
    gap: 8,
  },
  translationText: {
    ...typography.title,
    fontSize: 24,
    lineHeight: 31,
    color: colors.foreground,
  },
  errorText: {
    color: colors.danger,
    fontSize: 15,
    lineHeight: 22,
  },
  romanizedText: {
    ...typography.body,
    color: colors.muted,
    fontStyle: 'italic',
  },
  sourceText: {
    ...typography.body,
    fontSize: 13,
    color: colors.dim,
  },
  regionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hint: {
    ...typography.body,
    color: colors.dim,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
