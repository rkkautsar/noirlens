import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { languageLabel } from '@/constants/languages';
import type { ScanResult } from '@/scanner/machine';
import { colors, typography } from '@/theme';
import { TopBar } from './TopBar';
import { ChipButton, Hairline, MicroLabel, SolidButton } from './ui';

export function ResultCard({
  result,
  remaining,
  unlimited,
  ecoMode,
  onEcoChange,
  onScanAgain,
  onShowOriginal,
  onOpenLanguages,
  onOpenPaywall,
}: {
  result: ScanResult;
  remaining: number | null;
  unlimited: boolean;
  ecoMode: boolean;
  onEcoChange: (eco: boolean) => void;
  onScanAgain: () => void;
  onShowOriginal: () => void;
  onOpenLanguages: () => void;
  onOpenPaywall: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      clearTimeout(copyTimer.current ?? undefined);
    };
  }, []);

  const copy = async () => {
    await Clipboard.setStringAsync(result.translatedText);
    setCopied(true);
    clearTimeout(copyTimer.current ?? undefined);
    copyTimer.current = setTimeout(() => {
      setCopied(false);
    }, 1400);
  };

  return (
    <View style={styles.container}>
      <TopBar
        active={false}
        ecoMode={ecoMode}
        onEcoChange={onEcoChange}
        remaining={remaining}
        unlimited={unlimited}
        onOpenLanguages={onOpenLanguages}
        onOpenPaywall={onOpenPaywall}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.kickerRow}>
          <MicroLabel tone="accent">TRANSLATED · ENGLISH</MicroLabel>
          {result.cached ? <MicroLabel tone="dim">LOCAL CACHE</MicroLabel> : null}
        </View>

        <Text style={styles.resultText} selectable>
          {result.translatedText}
        </Text>

        <Hairline />

        <View style={styles.sourceBlock}>
          <MicroLabel tone="dim">
            SOURCE · {languageLabel(result.sourceLanguage)}
          </MicroLabel>
          <Text style={styles.sourceText} numberOfLines={3} selectable>
            {result.sourceText}
          </Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.primaryAction}>
            <SolidButton label="SCAN AGAIN" onPress={onScanAgain} primary />
          </View>
          <ChipButton
            label={copied ? 'COPIED' : 'COPY'}
            onPress={() => {
              void copy();
            }}
          />
          <ChipButton label="ORIGINAL" onPress={onShowOriginal} />
        </View>

        <MicroLabel tone="dim" style={styles.footer}>
          {unlimited
            ? 'PRO · UNLIMITED SCANS'
            : `${remaining ?? 0} OF 15 FREE SCANS LEFT TODAY`}
        </MicroLabel>
      </ScrollView>
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
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
    gap: 20,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultText: {
    ...typography.result,
    color: colors.foreground,
  },
  sourceBlock: {
    gap: 8,
  },
  sourceText: {
    ...typography.body,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  primaryAction: {
    flex: 1,
  },
  footer: {
    marginTop: 8,
  },
});
