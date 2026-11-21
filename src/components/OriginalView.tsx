import { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { languageLabel } from '@/constants/languages';
import { imageFitRect, mapBlockRect } from '@/scanner/geometry';
import type { ScanResult } from '@/scanner/machine';
import { colors, typography } from '@/theme';
import { TopBar } from './TopBar';
import { MicroLabel, SolidButton } from './ui';

export function OriginalView({
  result,
  remaining,
  unlimited,
  ecoMode,
  onClose,
  onScanAgain,
  onOpenLanguages,
  onOpenPaywall,
  onEcoChange,
}: {
  result: ScanResult;
  remaining: number | null;
  unlimited: boolean;
  ecoMode: boolean;
  onClose: () => void;
  onScanAgain: () => void;
  onOpenLanguages: () => void;
  onOpenPaywall: () => void;
  onEcoChange: (eco: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState({ width: 0, height: 0 });

  const imageRect = imageFitRect(
    { width: result.imageWidth, height: result.imageHeight },
    stage,
    'contain',
  );
  const uri = result.previewJpegBase64
    ? `data:image/jpeg;base64,${result.previewJpegBase64}`
    : null;

  return (
    <View style={styles.container}>
      <TopBar
        ecoMode={ecoMode}
        onEcoChange={onEcoChange}
        remaining={remaining}
        unlimited={unlimited}
        onOpenLanguages={onOpenLanguages}
        onOpenPaywall={onOpenPaywall}
      />

      <View
        style={styles.stage}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setStage({ width, height });
        }}
      >
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
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + 112 }]}>
        <MicroLabel tone="accent">
          SOURCE · {languageLabel(result.sourceLanguage)}
        </MicroLabel>
        <ScrollView style={styles.sourceScroll}>
          <Text style={styles.sourceText} selectable>
            {result.sourceText}
          </Text>
        </ScrollView>
        <View style={styles.actions}>
          <View style={styles.action}>
            <SolidButton label="BACK" onPress={onClose} />
          </View>
          <View style={styles.action}>
            <SolidButton label="SCAN AGAIN" onPress={onScanAgain} primary />
          </View>
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
  sourceScroll: {
    maxHeight: 148,
  },
  sourceText: {
    ...typography.body,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  action: {
    flex: 1,
  },
});
