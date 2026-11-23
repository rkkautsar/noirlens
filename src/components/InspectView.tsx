import { useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { imageFitRect, mapBlockRect } from '@/scanner/geometry';
import type { ScanResult } from '@/scanner/machine';
import { translateText } from '@/services/translationTask';
import { colors, layout, typography } from '@/theme';
import { ChipButton, MicroLabel, SolidButton } from './ui';

export function useInspect(result: ScanResult | null, imageUri?: string) {
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<number | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translationFailed, setTranslationFailed] = useState(false);
  const requestId = useRef(0);

  const imageRect = result
    ? imageFitRect(
        { width: result.imageWidth, height: result.imageHeight },
        stage,
        'contain',
      )
    : { x: 0, y: 0, width: 0, height: 0 };
  const uri =
    imageUri ??
    (result?.previewJpegBase64
      ? `data:image/jpeg;base64,${result.previewJpegBase64}`
      : null);

  const inspect = (event: GestureResponderEvent) => {
    if (!result || !uri || stage.width <= 0) {
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
    setTranslationFailed(false);
    const block = best >= 0 ? result.blocks[best] : null;
    if (!block) {
      return;
    }
    const id = ++requestId.current;
    setTranslating(true);
    void translateText({
      text: block.text,
      sourceLanguage: result.sourceLanguage,
    }).then((outcome) => {
      if (requestId.current !== id) {
        return;
      }
      if (outcome.status === 'translated') {
        setTranslation(outcome.text || null);
      } else {
        setTranslationFailed(true);
      }
      setTranslating(false);
    });
  };

  const picked = selected !== null ? result?.blocks[selected] ?? null : null;

  return {
    result,
    stage,
    setStage,
    selected,
    translation,
    translating,
    translationFailed,
    imageRect,
    uri,
    inspect,
    picked,
  };
}

export type InspectController = ReturnType<typeof useInspect>;

/** Image + tapped line + translation; fills the shell viewport. */
export function InspectBody({
  controller,
}: {
  controller: InspectController;
}) {
  const {
    stage,
    setStage,
    selected,
    translation,
    translating,
    translationFailed,
    imageRect,
    uri,
    inspect,
    picked,
  } = controller;

  return (
    <View style={styles.body}>
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
          {uri && stage.width > 0 && controller.result
            ? controller.result.blocks.map((block, index) => {
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

      <View style={styles.panel}>
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
            ) : translationFailed ? (
              <MicroLabel tone="dim">COULD NOT TRANSLATE THIS TEXT</MicroLabel>
            ) : null}
          </ScrollView>
        ) : (
          <Text style={styles.hint}>
            Tap anywhere on the frame to read the text nearest that point.
          </Text>
        )}
      </View>
    </View>
  );
}

/** Inspect controls for the shell action slot. */
export function InspectActions({
  controller,
  onClose,
  onScanAgain,
  onOpenLanguages,
  onLookUp,
}: {
  controller: InspectController;
  onClose: () => void;
  onScanAgain: () => void;
  onOpenLanguages: () => void;
  onLookUp: (phrase: string, alt?: string) => void;
}) {
  const { picked, translation } = controller;

  return (
    <View style={styles.actions}>
      <SolidButton
        label="BACK"
        icon="chevron-back"
        iconOnly
        onPress={onClose}
      />
      <ChipButton
        label="Look up"
        icon="book-outline"
        iconOnly
        disabled={!picked}
        onPress={() => {
          if (picked) {
            onLookUp(picked.text, translation ?? undefined);
          }
        }}
      />
      <ChipButton
        label="Change language"
        icon="language-outline"
        iconOnly
        onPress={onOpenLanguages}
      />
      <SolidButton
        label="SCAN AGAIN"
        icon="refresh"
        iconOnly
        onPress={onScanAgain}
        primary
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
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
    paddingHorizontal: layout.page,
    paddingBottom: 14,
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
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
});
