import Ionicons from '@expo/vector-icons/Ionicons';
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
import { languageLabel, languageShortLabel } from '@/constants/languages';
import { captures, useCaptures } from '@/services/captures';
import { rerunCaptureOcr, retryCapture } from '@/services/captureProcessing';
import { colors, radius, typography } from '@/theme';

function formatTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Capture detail is only the image, the OCR boxes, the OCR language and
 * deletion. Translation, lookup, romanization and copy live on the existing
 * result screen so there is one result presentation in the app.
 */
export default function CaptureDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const state = useCaptures();
  const record = state.records.find((entry) => entry.id === id);

  const [imageFailed, setImageFailed] = useState(false);
  const [picker, setPicker] = useState(false);
  const [languageBusy, setLanguageBusy] = useState(false);
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

  useEffect(() => {
    if (record?.status === 'done' || record?.status === 'failed') {
      setLanguageBusy(false);
    }
  }, [record?.status]);

  const hint = record?.hint ?? '';
  const busy =
    languageBusy ||
    record?.status === 'pending' ||
    record?.status === 'processing';

  const chooseLanguage = (code: string) => {
    setPicker(false);
    if (!record) {
      return;
    }
    const next = code === 'auto' ? '' : code;
    if (next === record.hint) {
      return;
    }
    // Lock the control before the async metadata write so a second choice
    // cannot race the first one.
    setLanguageBusy(true);
    rerunCaptureOcr(record.id, next);
  };

  const translateAll = () => {
    if (!record) {
      return;
    }
    router.push({
      pathname: '/result',
      params: { captureId: record.id },
    });
  };

  const translateRegion = (index: number) => {
    if (!record) {
      return;
    }
    router.push({
      pathname: '/result',
      params: { captureId: record.id, block: String(index) },
    });
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
  const hasText = record.text.length > 0;

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
                  onPress={() => translateRegion(index)}
                  style={[
                    styles.block,
                    {
                      left: entry.x * imageWidth,
                      top: entry.y * imageHeight,
                      width: Math.max(entry.width * imageWidth, 18),
                      height: Math.max(entry.height * imageHeight, 12),
                    },
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
            {hasText ? (
              <ChipButton
                label="TRANSLATE ALL"
                icon="language-outline"
                onPress={translateAll}
              />
            ) : null}
          </View>

          {record.status === 'failed' ? (
            <View style={styles.noticeRow}>
              <Text style={styles.errorText}>
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

          {record.status === 'done' && !hasText ? (
            <Text style={styles.hint}>
              No text was recognized. Choose another OCR language and the image
              will be read again.
            </Text>
          ) : null}

          {hasText ? (
            <Text style={styles.hint}>
              Tap a highlighted region to translate it on the result screen,
              or translate the whole capture.
            </Text>
          ) : null}
        </View>
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
  processing: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 12,
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
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    flex: 1,
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
