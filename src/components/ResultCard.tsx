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
import { romanize, romanTermSpans } from '@/services/romanize';
import { romanizeNative } from '@/services/romanizeNative';
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
  onOpenPrices: (prices: PriceConversion[], selectedStart?: number) => void;
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
  const sourceTerms = [
    ...result.blocks
      .map((block) => block.text.trim())
      .filter(
        (text) => text.length > 0 && text.split(/\s+/).length <= 4,
      ),
    ...result.sourceText
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 2),
  ];
  const normalizedTerm = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const translationPrices = priceConversions(
    result.translatedText,
    result.sourceLanguage,
    preferred.code,
  );
  const sheetPrices =
    translationPrices.length > 0 ? translationPrices : prices;
  const translatedKeys = translationPrices.map(
    (price) => `${price.amount}/${price.source}`,
  );
  const missingSourcePrices = prices.filter((price) => {
    const key = `${price.amount}/${price.source}`;
    const index = translatedKeys.indexOf(key);
    if (index === -1) {
      return true;
    }
    translatedKeys.splice(index, 1);
    return false;
  });
  const renderSource = () => {
    if (missingSourcePrices.length === 0) {
      return result.sourceText;
    }
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const price of missingSourcePrices) {
      if (price.start < cursor) {
        continue;
      }
      if (price.start > cursor) {
        parts.push(result.sourceText.slice(cursor, price.start));
      }
      parts.push(
        <Text
          key={`source-price-${price.start}`}
          style={styles.priceTerm}
          onPress={() => {
            onOpenPrices(prices, price.start);
          }}
        >
          {result.sourceText.slice(price.start, price.end)}
        </Text>,
      );
      cursor = price.end;
    }
    parts.push(result.sourceText.slice(cursor));
    return parts;
  };
  const [romanizedState, setRomanizedState] = useState(() => ({
    input: result.sourceText,
    language: result.sourceLanguage,
    value: romanize(result.sourceText),
  }));
  useEffect(() => {
    let active = true;
    void romanizeNative(result.sourceText, result.sourceLanguage).then(
      (value) => {
        if (active) {
          setRomanizedState({
            input: result.sourceText,
            language: result.sourceLanguage,
            value,
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [result.sourceText, result.sourceLanguage]);
  const romanizedSource =
    romanizedState.input === result.sourceText &&
    romanizedState.language === result.sourceLanguage
      ? romanizedState.value
      : romanize(result.sourceText);

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
    // Romanized dish/brand names the translator kept as proper nouns.
    for (const match of text.matchAll(/[A-Z][a-z]+[ \t][A-Z][a-z]+/g)) {
      const start = match.index ?? 0;
      spans.push({ start, end: start + match[0].length, kind: 'term' });
    }
    for (const span of romanTermSpans(text, sourceTerms)) {
      spans.push({ start: span.start, end: span.end, kind: 'term' });
    }
    const priceSpans = spans.filter((span) => span.kind === 'price');
    const kept = spans.filter(
      (span) =>
        span.kind === 'price' ||
        !priceSpans.some(
          (price) => span.start < price.end && span.end > price.start,
        ),
    );
    kept.sort((a, b) => a.start - b.start);
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const span of kept) {
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
              onOpenPrices(sheetPrices, span.start);
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
            flexGrow: 1,
            justifyContent: 'center',
            paddingTop: insets.top + 56,
            paddingBottom: insets.bottom + 190,
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

        {translated &&
        romanizedSource &&
        romanizedSource !== result.sourceText ? (
          <View style={styles.romanizedBlock}>
            <MicroLabel tone="dim">ROMANIZED · APPROX.</MicroLabel>
            <Text style={styles.romanizedText}>{romanizedSource}</Text>
          </View>
        ) : null}

        <Hairline />

        <View style={styles.sourceBlock}>
          <Text
            style={styles.sourceText}
            numberOfLines={
              missingSourcePrices.length > 0 ? undefined : translated ? 3 : 6
            }
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
          { bottom: insets.bottom + 94 },
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
  romanizedBlock: {
    gap: 6,
  },
  romanizedText: {
    ...typography.body,
    color: colors.muted,
    lineHeight: 22,
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
