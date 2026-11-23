import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { languageLabel, languageShortLabel } from '@/constants/languages';
import type { ScanResult } from '@/scanner/machine';
import {
  formatCurrency,
  priceConversions,
  type PriceConversion,
} from '@/services/currency';
import { preferredCurrency } from '@/services/localeCurrency';
import { termPattern, untranslatedTerms } from '@/services/lookup';
import { colors, typography } from '@/theme';
import { PriceEstimate } from './PriceEstimate';
import { ChipButton, Hairline, MicroLabel, SolidButton } from './ui';

export function ResultCard({
  result,
  remaining,
  unlimited,
  onScanAgain,
  onShowOriginal,
  onOpenLanguages,
  onLookUp,
  onOpenPrices,
}: {
  result: ScanResult;
  remaining: number | null;
  unlimited: boolean;
  onScanAgain: () => void;
  onShowOriginal: () => void;
  onOpenLanguages: () => void;
  onLookUp: (phrase: string, alt?: string) => void;
  onOpenPrices: (prices: PriceConversion[]) => void;
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
    ? `${language} → ENGLISH`
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
  const lookupTerms = translated ? untranslatedTerms(result) : [];
  const lookupPattern = termPattern(lookupTerms);
  const normalizedTerm = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const translationPrices = priceConversions(
    result.translatedText,
    'en',
    preferred.code,
  );
  const renderSource = () => result.sourceText;

  const renderTranslation = () => {
    const text = result.translatedText;
    const spans: Array<{
      start: number;
      end: number;
      kind: 'term' | 'price';
    }> = [];
    if (lookupPattern) {
      for (const match of text.matchAll(lookupPattern)) {
        const start = match.index ?? 0;
        spans.push({ start, end: start + match[0].length, kind: 'term' });
      }
    }
    for (const price of translationPrices) {
      spans.push({ start: price.start, end: price.end, kind: 'price' });
    }
    spans.sort((a, b) => a.start - b.start);
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const span of spans) {
      if (span.start < cursor) {
        continue;
      }
      if (span.start > cursor) {
        parts.push(text.slice(cursor, span.start));
      }
      const slice = text.slice(span.start, span.end);
      parts.push(
        <Text
          key={`${span.kind}-${span.start}`}
          style={span.kind === 'price' ? styles.priceTerm : styles.lookupTerm}
          onPress={() => {
            if (span.kind === 'price') {
              onOpenPrices(translationPrices);
            } else {
              onLookUp(slice);
            }
          }}
        >
          {slice}
        </Text>,
      );
      cursor = span.end;
    }
    parts.push(text.slice(cursor));
    return parts;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 96,
          },
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
            {renderTranslation()}
          </Text>
        ) : (
          <View style={styles.noticeBlock}>
            <Text style={styles.noticeText}>{notice}</Text>
            <MicroLabel tone="dim">NOT CHARGED AS A SCAN</MicroLabel>
          </View>
        )}

        <Hairline />

        <View style={styles.sourceBlock}>
          <Text
            style={styles.sourceText}
            numberOfLines={translated ? 3 : 6}
            selectable
          >
            {renderSource()}
          </Text>
        </View>

        <MicroLabel tone="dim" style={styles.footer}>
          {unlimited
            ? 'PRO · UNLIMITED SCANS'
            : translated
              ? `${remaining ?? 0} OF 15 FREE SCANS LEFT TODAY`
              : `NOT CHARGED · ${remaining ?? 0} OF 15 FREE SCANS LEFT TODAY`}
        </MicroLabel>
      </ScrollView>

      <View
        style={[
          styles.actions,
          styles.fixedActions,
          { bottom: insets.bottom + 16 },
        ]}
      >
        <ChipButton
          label="INSPECT"
          icon="search-outline"
          iconOnly
          onPress={onShowOriginal}
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
          label="Change language"
          icon="language-outline"
          iconOnly
          onPress={onOpenLanguages}
        />
        <SolidButton
          label={primaryLabel}
          icon={primaryIcon}
          iconOnly
          onPress={primaryAction}
          primary
        />
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
  lookupTerm: {
    color: colors.accent,
    textDecorationLine: 'underline',
    textDecorationColor: colors.accent,
  },
  priceTerm: {
    color: colors.success,
    textDecorationLine: 'underline',
    textDecorationColor: colors.success,
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
  },
  fixedActions: {
    position: 'absolute',
    left: 20,
    right: 20,
    justifyContent: 'flex-end',
  },
  footer: {
    marginTop: 8,
  },
});
