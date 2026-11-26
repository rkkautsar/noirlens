import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { languageLabel, languageShortLabel } from '@/constants/languages';
import type { ScanResult } from '@/scanner/machine';
import {
  formatCurrency,
  priceConversions,
  type PriceConversion,
} from '@/services/currency';
import { preferredCurrency } from '@/services/localeCurrency';
import {
  areCommonWordsReady,
  loadCommonWords,
} from '@/services/commonWords';
import { lookupSpans, resolveTermSpans } from '@/services/lookup';
import { personalNameRanges } from '@/services/personNames';
import { resolvedNameRanges, type NameState } from '@/services/nameRanges';
import { romanize } from '@/services/romanize';
import { needsIcuRomanize, romanizeNative } from '@/services/romanizeNative';
import { colors, typography } from '@/theme';
import { PriceTooltip } from './PriceTooltip';
import { ChipButton, Hairline, MicroLabel, SolidButton } from './ui';

/** Reading surface: kicker, translation with lookup/price spans, romanization, source, footer. */
export function ResultBody({
  result,
  remaining,
  unlimited,
  onPreparePack,
  packBusy = false,
  packError,
  onLookUp,
}: {
  result: ScanResult;
  remaining: number | null;
  unlimited: boolean;
  onPreparePack?: () => void;
  packBusy?: boolean;
  packError?: string | null;
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
  const prices = useMemo(
    () => priceConversions(result.sourceText, result.sourceLanguage, preferred.code),
    [result.sourceText, result.sourceLanguage, preferred.code],
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

  const [wordsReady, setWordsReady] = useState(areCommonWordsReady);
  useEffect(() => {
    if (wordsReady) {
      return;
    }
    let active = true;
    loadCommonWords()
      .then(() => {
        if (active) {
          setWordsReady(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [wordsReady]);

  const [nameState, setNameState] = useState<NameState | null>(null);
  const nameRanges = resolvedNameRanges(nameState, result.translatedText);
  useEffect(() => {
    let active = true;
    if (!translated) {
      setNameState(null);
      return;
    }
    const text = result.translatedText;
    setNameState(null);
    personalNameRanges(text)
      .then((ranges) => {
        if (active) {
          setNameState({ text, ranges });
        }
      })
      .catch(() => {
        if (active) {
          setNameState({ text, ranges: null });
        }
      });
    return () => {
      active = false;
    };
  }, [result.translatedText, translated]);
  const termSpans = useMemo(
    () =>
      translated && nameRanges && wordsReady
        ? lookupSpans({ translatedText: result.translatedText }, nameRanges)
        : [],
    [result.translatedText, translated, nameRanges, wordsReady],
  );
  const translationPrices = useMemo(
    () =>
      priceConversions(
        result.translatedText,
        result.sourceLanguage,
        preferred.code,
      ),
    [result.translatedText, result.sourceLanguage, preferred.code],
  );

  const jsRomanized = useMemo(
    () => romanize(result.sourceText),
    [result.sourceText],
  );
  const [nativeRomanized, setNativeRomanized] = useState<{
    input: string;
    language: string;
    value: string;
  } | null>(null);
  useEffect(() => {
    if (!needsIcuRomanize(result.sourceText)) {
      setNativeRomanized(null);
      return;
    }
    let active = true;
    void romanizeNative(result.sourceText, result.sourceLanguage).then(
      (value) => {
        if (active) {
          setNativeRomanized({
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
    nativeRomanized &&
    nativeRomanized.input === result.sourceText &&
    nativeRomanized.language === result.sourceLanguage
      ? nativeRomanized.value
      : jsRomanized;

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
    const termOnly = resolveTermSpans(termSpans, translationPrices, text);
    const kept = [
      ...termOnly.map((span) => ({
        start: span.start,
        end: span.end,
        kind: 'term' as const,
      })),
      ...translationPrices.map((price) => ({
        start: price.start,
        end: price.end,
        kind: 'price' as const,
        price,
      })),
    ].sort((a, b) => a.start - b.start);
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
          {packMissing && packError ? (
            <Text style={styles.packError}>{packError}</Text>
          ) : null}
          {packMissing && onPreparePack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Download language pack"
              disabled={packBusy}
              onPress={onPreparePack}
              style={({ pressed }) => [
                styles.packAction,
                packBusy && styles.packActionBusy,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.packActionText}>
                {packBusy ? 'INSTALLING…' : 'DOWNLOAD PACK'}
              </Text>
            </Pressable>
          ) : null}
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
  onBack,
  onShowOriginal,
  thumbnail,
  onOpenLanguages,
  primary = 'scan',
}: {
  result: ScanResult;
  onScanAgain: () => void;
  onBack?: () => void;
  onShowOriginal?: () => void;
  thumbnail?: string;
  onOpenLanguages: () => void;
  /** Live results scan again in place; pushed results start a new scan. */
  primary?: 'scan' | 'close' | 'new';
}) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translated = result.kind === 'translated';
  const preferred = preferredCurrency();
  const prices = useMemo(
    () => priceConversions(result.sourceText, result.sourceLanguage, preferred.code),
    [result.sourceText, result.sourceLanguage, preferred.code],
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
    primary === 'close'
      ? 'BACK'
      : primary === 'new'
        ? 'NEW SCAN'
        : translated
          ? 'SCAN AGAIN'
          : 'CHOOSE LANGUAGE';
  const primaryIcon =
    primary === 'close'
      ? 'chevron-back'
      : translated
        ? 'refresh'
        : 'language-outline';
  const primaryAction =
    primary === 'close'
      ? onBack ?? onScanAgain
      : primary === 'new'
        ? onScanAgain
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
  packAction: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  packActionBusy: {
    opacity: 0.6,
  },
  packActionText: {
    ...typography.micro,
    color: colors.accent,
  },
  packError: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.warning,
  },
  pressed: {
    opacity: 0.7,
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
