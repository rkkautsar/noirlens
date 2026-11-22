import { useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import vision from '../../modules/native-vision-translator';
import { imageFitRect, mapBlockRect } from '@/scanner/geometry';
import type { ScanResult } from '@/scanner/machine';
import { colors, typography } from '@/theme';
import { MicroLabel, SolidButton } from './ui';

export function OriginalView({
  result,
  onClose,
  onScanAgain,
}: {
  result: ScanResult;
  onClose: () => void;
  onScanAgain: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<number | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const requestId = useRef(0);

  const imageRect = imageFitRect(
    { width: result.imageWidth, height: result.imageHeight },
    stage,
    'contain',
  );
  const uri = result.previewJpegBase64
    ? `data:image/jpeg;base64,${result.previewJpegBase64}`
    : null;

  const inspect = (event: GestureResponderEvent) => {
    if (!uri || stage.width <= 0) {
      return;
    }
    const native = event.nativeEvent as unknown as {
      locationX: number;
      locationY: number;
      clientX?: number;
      clientY?: number;
    };
    let x = native.locationX;
    let y = native.locationY;
    if (Platform.OS === 'web') {
      const target = event.currentTarget as unknown as {
        getBoundingClientRect?: () => { left: number; top: number };
      };
      const rect = target.getBoundingClientRect?.();
      if (
        rect &&
        native.clientX !== undefined &&
        native.clientY !== undefined
      ) {
        x = native.clientX - rect.left;
        y = native.clientY - rect.top;
      }
    }
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    result.blocks.forEach((block, index) => {
      const rect = mapBlockRect(block, imageRect);
      const distance = Math.hypot(
        rect.x + rect.width / 2 - x,
        rect.y + rect.height / 2 - y,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    setSelected(best >= 0 ? best : null);
    setTranslation(null);
    const block = best >= 0 ? result.blocks[best] : null;
    if (!block) {
      return;
    }
    const id = ++requestId.current;
    setTranslating(true);
    void vision
      .translate({ text: block.text, sourceLanguage: result.sourceLanguage })
      .then((payload) => {
        if (requestId.current === id) {
          setTranslation(payload.translatedText || null);
        }
      })
      .catch(() => {
        if (requestId.current === id && result.kind === 'translated') {
          setTranslation(result.translatedText || null);
        }
      })
      .finally(() => {
        if (requestId.current === id) {
          setTranslating(false);
        }
      });
  };

  const picked = selected !== null ? result.blocks[selected] : null;

  return (
    <View style={styles.container}>
      <View
        style={styles.stage}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setStage({ width, height });
        }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={inspect}>
          {uri ? (
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
            />
          ) : (
            <MicroLabel tone="dim">FROZEN FRAME UNAVAILABLE</MicroLabel>
          )}

          {uri && stage.width > 0
            ? result.blocks.map((block, index) => {
                const rect = mapBlockRect(block, imageRect);
                return (
                  <View
                    key={`${block.text}-${index}`}
                    pointerEvents="none"
                    style={[
                      styles.box,
                      selected === index && styles.boxSelected,
                      {
                        left: rect.x,
                        top: rect.y,
                        width: rect.width,
                        height: rect.height,
                      },
                    ]}
                  />
                );
              })
            : null}
        </Pressable>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + 112 }]}>
        <MicroLabel tone="accent">INSPECT · TAP THE TEXT</MicroLabel>
        {picked ? (
          <ScrollView style={styles.pickedScroll}>
            <Text style={styles.pickedText} selectable>
              {picked.text}
            </Text>
            {translating ? (
              <MicroLabel tone="dim">TRANSLATING…</MicroLabel>
            ) : translation ? (
              <Text style={styles.translatedText} selectable>
                {translation}
              </Text>
            ) : null}
          </ScrollView>
        ) : (
          <Text style={styles.hint}>
            Tap anywhere on the frame to read the text nearest that point.
          </Text>
        )}
        <View style={styles.actions}>
          <SolidButton
            label="BACK"
            icon="chevron-back"
            iconOnly
            onPress={onClose}
          />
          <SolidButton
            label="SCAN AGAIN"
            icon="refresh"
            iconOnly
            onPress={onScanAgain}
            primary
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.background,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  boxSelected: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingTop: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  pickedScroll: {
    maxHeight: 120,
  },
  pickedText: {
    ...typography.result,
    fontSize: 18,
    lineHeight: 24,
    color: colors.foreground,
  },
  translatedText: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.accent,
    marginTop: 6,
  },
  hint: {
    ...typography.body,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
