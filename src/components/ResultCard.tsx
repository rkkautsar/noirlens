import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { languageLabel, languageShortLabel } from '@/constants/languages';
import type { ScanResult } from '@/scanner/machine';
import {
  formatCurrency,
  priceConversions,
} from '@/services/currency';
import { preferredCurrency } from '@/services/localeCurrency';
import { colors, typography } from '@/theme';
import { PriceEstimate } from './PriceEstimate';
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

  const translated = result.kind === 'translated';
  const englishOnly = result.kind === 'english';
  const packMissing = result.kind === 'pack_missing';
  const language = languageLabel(result.sourceLanguage);
  const shortLanguage = languageShortLabel(result.sourceLanguage);
  const preferred = preferredCurrency();
  const prices = priceConversions(
    result.sourceText,
    result.sourceLanguage,
    preferred.code,
  );
  const copyText = translated ? result.translatedText : result.sourceText;
  const priceLines = prices.map(
    (price) =>
      `${price.raw} ≈ ${formatCurrency(price.converted, price.target, preferred.locale)}`,
  );

  useEffect(() => {
    return () => {
      clearTimeout(copyTimer.current ?? undefined);
    };
  }, []);

  const copy = async () => {
    const parts = [copyText, ...priceLines].filter(Boolean);
    await Clipboard.setStringAsync(parts.join('\n\n'));
    setCopied(true);
    clearTimeout(copyTimer.current ?? undefined);
    copyTimer.current = setTimeout(() => {
      setCopied(false);
    }, 1400);
  };

  const kicker = translated
    ? 'TRANSLATED · ENGLISH'
    : englishOnly
      ? result.sourceLanguage === 'und'
        ? 'NO LANGUAGE DETECTED'
        : 'ENGLISH DETECTED'
      : `${language} PACK NEEDED`;

  const notice = englishOnly
    ? result.sourceLanguage === 'und'
      ? 'No supported non-English language was detected. Aim at the sign or choose a source language.'
      : 'English text detected. NoirLens translates non-English text into English. Aim at a foreign sign or choose a source language.'
    : packMissing
      ? `The ${language} offline pack is not installed. Download it once, then scan again. You can still read the source below.`
      : '';

  const primaryLabel = translated
    ? 'SCAN AGAIN'
    : packMissing
      ? `GET ${shortLanguage} PACK`
      : 'CHOOSE LANGUAGE';
  const primaryIcon = translated
    ? 'refresh'
    : packMissing
      ? 'cloud-download-outline'
      : 'language-outline';
  const primaryAction = translated ? onScanAgain : onOpenLanguages;

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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 124 },
        ]}
      >
        <View style={styles.kickerRow}>
          <MicroLabel
            tone={translated ? 'accent' : packMissing ? 'warning' : 'dim'}
          >
            {kicker}
          </MicroLabel>
          {translated && result.cached ? (
            <MicroLabel tone="dim">LOCAL CACHE</MicroLabel>
          ) : null}
        </View>

        {translated ? (
          <Text style={styles.resultText} selectable>
            {result.translatedText}
          </Text>
        ) : (
          <View style={styles.noticeBlock}>
            <Text style={styles.noticeText}>{notice}</Text>
            <MicroLabel tone="dim">NOT CHARGED AS A SCAN</MicroLabel>
          </View>
        )}

        <PriceEstimate
          rows={prices}
          target={preferred.code}
          locale={preferred.locale}
        />

        <Hairline />

        <View style={styles.sourceBlock}>
          <MicroLabel tone="dim">SOURCE · {language}</MicroLabel>
          <Text
            style={styles.sourceText}
            numberOfLines={translated ? 3 : 6}
            selectable
          >
            {result.sourceText}
          </Text>
        </View>

        <View style={styles.actions}>
          <SolidButton
            label={primaryLabel}
            icon={primaryIcon}
            iconOnly
            onPress={primaryAction}
            primary
          />
          <ChipButton
            label={copied ? 'COPIED' : 'COPY'}
            icon={copied ? 'checkmark' : 'copy-outline'}
            iconOnly
            active={copied}
            onPress={() => {
              void copy();
            }}
          />
          {translated ? null : (
            <ChipButton
              label="SCAN AGAIN"
              icon="refresh"
              iconOnly
              onPress={onScanAgain}
            />
          )}
          <ChipButton
            label="ORIGINAL"
            icon="image-outline"
            iconOnly
            onPress={onShowOriginal}
          />
        </View>

        <MicroLabel tone="dim" style={styles.footer}>
          {unlimited
            ? 'PRO · UNLIMITED SCANS'
            : translated
              ? `${remaining ?? 0} OF 15 FREE SCANS LEFT TODAY`
              : `NOT CHARGED · ${remaining ?? 0} OF 15 FREE SCANS LEFT TODAY`}
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
  noticeBlock: {
    borderLeftWidth: 2,
    borderLeftColor: colors.warning,
    paddingLeft: 12,
    gap: 8,
  },
  noticeText: {
    ...typography.body,
    fontSize: 17,
    lineHeight: 24,
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
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  footer: {
    marginTop: 8,
  },
});
