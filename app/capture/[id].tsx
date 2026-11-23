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

import { ModeTabs } from '@/components/ModeTabs';
import { ChipButton, MicroLabel } from '@/components/ui';
import { languageLabel } from '@/constants/languages';
import { captures, useCaptures } from '@/services/captures';
import { retryCapture } from '@/services/captureProcessing';
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
  const requestId = useRef(0);
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

  const source = record?.language || record?.hint || 'en';

  const copy = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(key);
    setTimeout(() => {
      setCopied((current) => (current === key ? null : current));
    }, 1400);
  };

  const translate = async (
    text: string,
    set: (value: TranslationState) => void,
  ) => {
    if (!record || text.trim().length === 0) {
      return;
    }
    const token = requestId.current + 1;
    requestId.current = token;
    set({ status: 'loading', text: '', error: '', packGap: false });
    try {
      const out = await vision.translate({
        text,
        sourceLanguage: source,
        targetLanguage: 'en',
      });
      if (token !== requestId.current) {
        return;
      }
      set({
        status: 'done',
        text: out.translatedText,
        error: '',
        packGap: false,
      });
    } catch (error) {
      if (token !== requestId.current) {
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

  const preparePack = async (
    text: string,
    set: (value: TranslationState) => void,
  ) => {
    try {
      const status = await vision.prepareLanguagePack(source, 'en');
      if (status.status === 'installed') {
        await translate(text, set);
        return;
      }
      set({
        status: 'error',
        text: '',
        error: 'The offline pack did not finish installing. Try again.',
        packGap: true,
      });
    } catch (error) {
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
    const block = record.blocks[index];
    if (block) {
      void translate(block.text, setRegion);
    }
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
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <ChipButton
        label="Back"
        icon="chevron-back"
        iconOnly
        onPress={() => router.back()}
      />
      <View style={styles.headerTitle} />
      <ChipButton
        label="Delete capture"
        icon="trash-outline"
        iconOnly
        onPress={remove}
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
  const block = selected !== null ? record.blocks[selected] : undefined;

  return (
    <View style={styles.root}>
      {header}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <MicroLabel tone="dim">{formatTime(record.at)}</MicroLabel>
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
          {record.status === 'pending' || record.status === 'processing' ? (
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
              label="RETRY"
              icon="refresh"
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
              <MicroLabel tone="accent">
                {languageLabel(record.language || record.hint || 'und')} ·
                SELECT A REGION
              </MicroLabel>
              <ChipButton
                label="TRANSLATE ALL"
                icon="language-outline"
                onPress={() => void translate(record.text, setAll)}
              />
            </View>

            {block ? (
              <View style={styles.region}>
                <Text style={styles.sourceText} selectable>
                  {block.text}
                </Text>
                <Text style={styles.translationText} selectable>
                  {region.status === 'loading'
                    ? 'Translating…'
                    : region.status === 'done'
                      ? region.text
                      : region.status === 'error'
                        ? region.error
                        : ''}
                </Text>
                <View style={styles.regionActions}>
                  <ChipButton
                    label={copied === 'region-src' ? 'COPIED' : 'COPY TEXT'}
                    icon="copy-outline"
                    onPress={() => void copy(block.text, 'region-src')}
                  />
                  {region.status === 'done' ? (
                    <ChipButton
                      label={copied === 'region-out' ? 'COPIED' : 'COPY TRANSLATION'}
                      icon="copy-outline"
                      onPress={() => void copy(region.text, 'region-out')}
                    />
                  ) : null}
                  {region.status === 'error' && region.packGap ? (
                    <ChipButton
                      label="DOWNLOAD PACK"
                      icon="download-outline"
                      onPress={() => void preparePack(block.text, setRegion)}
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
                <Text style={styles.translationText} selectable>
                  {all.status === 'loading'
                    ? 'Translating…'
                    : all.status === 'done'
                      ? all.text
                      : all.error}
                </Text>
                <View style={styles.regionActions}>
                  {all.status === 'done' ? (
                    <ChipButton
                      label={copied === 'all-out' ? 'COPIED' : 'COPY TRANSLATION'}
                      icon="copy-outline"
                      onPress={() => void copy(all.text, 'all-out')}
                    />
                  ) : null}
                  {all.status === 'error' && all.packGap ? (
                    <ChipButton
                      label="DOWNLOAD PACK"
                      icon="download-outline"
                      onPress={() => void preparePack(record.text, setAll)}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <ModeTabs
        active="camera"
        onCamera={() => router.back()}
        onTranslate={() => router.push('/translate')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  headerTitle: {
    alignItems: 'center',
    gap: 2,
  },
  title: {
    ...typography.label,
    color: colors.foreground,
    letterSpacing: 1.6,
  },
  content: {
    padding: 16,
    paddingTop: 30,
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
    backgroundColor: 'rgba(217,179,108,0.08)',
    borderRadius: 3,
  },
  blockActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(217,179,108,0.24)',
  },
  processing: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  notice: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 10,
  },
  noticeText: {
    ...typography.body,
    color: colors.muted,
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
  region: {
    gap: 8,
  },
  sourceText: {
    ...typography.body,
    color: colors.muted,
  },
  translationText: {
    ...typography.title,
    fontSize: 20,
    lineHeight: 27,
    color: colors.foreground,
  },
  regionActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hint: {
    ...typography.body,
    color: colors.dim,
  },
});
