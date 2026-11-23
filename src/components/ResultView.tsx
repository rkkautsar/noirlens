import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

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
import { PriceTooltip } from './PriceTooltip';
import { ChipButton, Hairline, MicroLabel, SolidButton } from './ui';

/** Reading surface: kicker, translation with lookup/price spans, romanization, source, footer. */
export function ResultBody({
  result,
  remaining,
  unlimited,
  onLookUp,
}: {
  result: ScanResult;
  remaining: number | null;
  unlimited: boolean;
  onLookUp: (phrase: string, alt?: string) => void;
}) {
  const [priceTip, setPriceTip] = useState<{
    price: PriceConversion;
    x: number;
    y: number;
  } | null>(null);

  const translated = result.kind === 'translated';
  const englishOnly = result.kind === 'english';
  const packMissing = result.kind === 'pack_missing';
  const language = languageLabel(result.sourceLanguage);
  const preferred = preferredCurrency();
  const prices = priceConversions(
    result.sourceText,
    result.sourceLanguage,
    preferred.code,
  );

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

  const lookupTerms = translated ? untranslatedTerms(result) : [];
  const lookupPattern = termPattern(lookupTerms);
  const sourceTerms = [
    ...result.blocks
      .map((block) => block.text.trim())
      .filter((text) => text.length > 0 && text.split(/\s+/).length <= 4),
    ...result.sourceText
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 2),
  ];
  const translationPrices = priceConversions(
    result.translatedText,
    result.sourceLanguage,
    preferred.code,
  );

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

  const tipAt = (
    price: PriceConversion,
    pageX?: number,
    pageY?: number,
  ) => {
    setPriceTip({ price, x: pageX ?? Number.NaN, y: pageY ?? Number.NaN });
  };

  const renderSource = () => {
    if (prices.length === 0) {
      return result.sourceText;
    }
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const price of prices) {
      if (price.start < cursor) {
        continue;
      }
      if (price.start > cursor) {
        parts.push(result.sourceText.slice(cursor, price.start));
      }
      parts.push(
        <Text
          key={`source-price-${price.start}`}
          style={[styles.sourceText, styles.priceTerm]}
          onPress={(event) => {
            const native = (
              event as
                | { nativeEvent?: { pageX?: number; pageY?: number } }
                | undefined
            )?.nativeEvent;
            tipAt(price, native?.pageX, native?.pageY);
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

  const renderTranslation = () => {
    const text = result.translatedText;
    const spans: Array<{
      start: number;
      end: number;
      kind: 'term' | 'price';
      price?: PriceConversion;
    }> = [];
    if (lookupPattern) {
      for (const match of text.matchAll(lookupPattern)) {
        const start = match.index ?? 0;
        spans.push({ start, end: start + match[0].length, kind: 'term' });
      }
    }
    for (const price of translationPrices) {
      spans.push({ start: price.start, end: price.end, kind: 'price', price });
    }
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
          style={[
            styles.resultText,
            span.kind === 'price' ? styles.priceTerm : styles.lookupTerm,
          ]}
          onPress={(event) => {
            if (span.kind === 'price' && span.price) {
              const native = (
                event as
                  | { nativeEvent?: { pageX?: number; pageY?: number } }
                  | undefined
              )?.nativeEvent;
              tipAt(span.price, native?.pageX, native?.pageY);
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
    <>
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

      {translated && romanizedSource && romanizedSource !== result.sourceText ? (
        <View style={styles.romanizedBlock}>
          <MicroLabel tone="dim">ROMANIZED · APPROX.</MicroLabel>
          <Text style={styles.romanizedText}>{romanizedSource}</Text>
        </View>
      ) : null}

      <Hairline />

      <View style={styles.sourceBlock}>
        <Text
          style={styles.sourceText}
          numberOfLines={prices.length > 0 ? undefined : translated ? 3 : 6}
          selectable
        >
          {renderSource()}
        </Text>
      </View>

      <MicroLabel tone="dim" style={styles.footer}>
        {unlimited
          ? 'PRO · UNLIMITED SCANS'
          : remaining !== null
            ? translated
              ? `${remaining} OF 15 FREE SCANS LEFT TODAY`
              : `NOT CHARGED · ${remaining} OF 15 FREE SCANS LEFT TODAY`
            : translated
              ? 'FREE SCANS LEFT TODAY'
              : 'NOT CHARGED · FREE SCANS LEFT TODAY'}
      </MicroLabel>

      {priceTip ? (
        <PriceTooltip
          price={priceTip.price}
          locale={preferred.locale}
          x={priceTip.x}
          y={priceTip.y}
          onClose={() => setPriceTip(null)}
        />
      ) : null}
    </>
  );
}

/** Action row: inspect thumbnail, copy, scan-again/language, primary action. */
export function ResultActions({
  result,
  onScanAgain,
  onShowOriginal,
  thumbnail,
  onOpenLanguages,
  onPreparePack,
}: {
  result: ScanResult;
  onScanAgain: () => void;
  onShowOriginal?: () => void;
  thumbnail?: string;
  onOpenLanguages: () => void;
  onPreparePack?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translated = result.kind === 'translated';
  const packMissing = result.kind === 'pack_missing';
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

  const primaryLabel =
    packMissing && onPreparePack
      ? `GET ${shortLanguage} PACK`
      : translated
        ? 'SCAN AGAIN'
        : packMissing
          ? `GET ${shortLanguage} PACK`
          : 'CHOOSE LANGUAGE';
  const primaryIcon =
    packMissing && onPreparePack
      ? 'cloud-download-outline'
      : translated
        ? 'refresh'
        : packMissing
          ? 'cloud-download-outline'
          : 'language-outline';
  const primaryAction =
    packMissing && onPreparePack
      ? onPreparePack
      : translated
        ? onScanAgain
        : onOpenLanguages;

  return (
    <View style={styles.actions}>
      {thumbnail ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Inspect original frame"
          onPress={onShowOriginal}
          style={styles.thumbnailButton}
        >
          <Image source={{ uri: thumbnail }} style={styles.thumbnail} />
        </Pressable>
      ) : onShowOriginal ? (
        <ChipButton
          label="INSPECT"
          icon="search-outline"
          iconOnly
          onPress={onShowOriginal}
        />
      ) : null}
      <ChipButton
        label={copied ? 'COPIED' : 'COPY'}
        icon={copied ? 'checkmark' : 'copy-outline'}
        iconOnly
        active={copied}
        onPress={() => {
          void copy();
        }}
      />
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
  );
}


const styles = StyleSheet.create({
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
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
  },
  thumbnailButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  footer: {
    marginTop: 8,
  },
});
