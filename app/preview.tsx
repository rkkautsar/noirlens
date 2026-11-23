import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AimHud } from '@/components/AimHud';
import { OriginalView } from '@/components/OriginalView';
import { ResultCard } from '@/components/ResultCard';
import { HistorySheet } from '@/components/HistorySheet';
import { LanguagesSheet } from '@/components/LanguagesSheet';
import { LookupSheet } from '@/components/LookupSheet';
import { OverlaySheet } from '@/components/OverlaySheet';
import { PricesSheet } from '@/components/PricesSheet';
import { ResultSheet } from '@/components/ResultSheet';
import { ScanShutter } from '@/components/ScanShutter';
import { Standby } from '@/components/Standby';
import { TopBar } from '@/components/TopBar';
import { languageShortLabel } from '@/constants/languages';
import type { ScanResult } from '@/scanner/machine';
import { useSourceLanguage } from '@/services/sourceLanguage';
import { colors } from '@/theme';

type Mode = 'standby' | 'aim' | 'result' | 'original';

const RESULT: ScanResult = {
  kind: 'translated',
  sourceText:
    'Bánh mì thịt\nBánh mì kẹp thịt heo, pâté và rau củ muối\n45.000đ',
  translatedText:
    'Bánh mì thịt\nBaguette with pork, pâté and pickled vegetables\n45,000 VND',
  sourceLanguage: 'vi',
  sourceHash: 'preview',
  blocks: [
    {
      text: 'Bánh mì thịt',
      confidence: 0.96,
      x: 0.14,
      y: 0.22,
      width: 0.72,
      height: 0.11,
    },
    {
      text: 'Bánh mì kẹp thịt heo, pâté và rau củ muối',
      confidence: 0.92,
      x: 0.08,
      y: 0.42,
      width: 0.84,
      height: 0.1,
    },
    {
      text: '45.000đ',
      confidence: 0.9,
      x: 0.42,
      y: 0.62,
      width: 0.3,
      height: 0.08,
    },
  ],
  imageWidth: 1000,
  imageHeight: 1000,
  cached: false,
};

export default function PreviewScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(
    params.mode === 'result'
      ? 'result'
      : params.mode === 'original'
        ? 'original'
        : 'standby',
  );
  const router = useRouter();
  const [overlay, setOverlay] = useState<
    | { kind: 'lookup'; q: string; alt?: string }
    | {
        kind: 'prices';
        rows: import('@/services/currency').PriceConversion[];
        selectedStart?: number;
      }
    | { kind: 'languages' }
    | { kind: 'history'; demo?: boolean }
    | null
  >(null);
  const openPrices = (
    prices: import('@/services/currency').PriceConversion[],
    selectedStart?: number,
  ) => {
    if (prices.length === 0) {
      return;
    }
    setOverlay({ kind: 'prices', rows: prices, selectedStart });
  };
  const lookUp = (phrase: string, alt?: string) => {
    setOverlay({ kind: 'lookup', q: phrase, alt });
  };
  const source = useSourceLanguage();
  const [ecoMode, setEcoMode] = useState(true);
  const [pressing, setPressing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noop = () => {};

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const start = () => {
    if (scanning) {
      return;
    }
    if (mode === 'result' || mode === 'original') {
      setMode('standby');
      return;
    }
    setPressing(true);
    setMode('aim');
  };

  const capture = () => {
    if (!pressing) {
      return;
    }
    setPressing(false);
    setScanning(true);
    timer.current = setTimeout(() => {
      setScanning(false);
      setMode('result');
    }, 700);
  };

  const showResult = mode === 'result' || mode === 'original';

  return (
    <View style={styles.page}>
      <View style={styles.phone}>
        {overlay ? (
          <OverlaySheet onClose={() => setOverlay(null)}>
            {overlay.kind === 'lookup' ? (
              <LookupSheet
                q={overlay.q}
                alt={overlay.alt}
                onClose={() => setOverlay(null)}
              />
            ) : overlay.kind === 'prices' ? (
              <PricesSheet
                rows={overlay.rows}
                selectedStart={overlay.selectedStart}
                onClose={() => setOverlay(null)}
              />
            ) : overlay.kind === 'languages' ? (
              <LanguagesSheet onClose={() => setOverlay(null)} />
            ) : (
              <HistorySheet
                demo={overlay.demo}
                onClose={() => setOverlay(null)}
              />
            )}
          </OverlaySheet>
        ) : null}
        <Standby
          hidden={mode === 'aim'}
          remaining={15}
          error={null}
          onOpenLanguages={noop}
          onOpenPaywall={noop}
          onDismissError={noop}
        />
        {mode === 'aim' ? <AimHud scanning={scanning} error={null} /> : null}
        {showResult ? (
          <ResultSheet
            onDismiss={() => {
              setMode('standby');
            }}
          >
            {mode === 'original' ? (
              <OriginalView
                result={RESULT}
                onClose={() => {
                  setMode('result');
                }}
                onScanAgain={() => {
                  setMode('standby');
                }}
                onOpenLanguages={noop}
                onLookUp={lookUp}
              />
            ) : (
              <ResultCard
                result={RESULT}
                remaining={15}
                unlimited
                onScanAgain={() => {
                  setMode('standby');
                }}
                onShowOriginal={() => {
                  setMode('original');
                }}
                onOpenLanguages={noop}
                onLookUp={lookUp}
                onOpenPrices={openPrices}
              />
            )}
          </ResultSheet>
        ) : null}

        <ScanShutter
          active={pressing}
          scanning={scanning}
          next={showResult}
          onStart={start}
          onCapture={capture}
          onCancel={() => {
            setPressing(false);
            setScanning(false);
            setMode('standby');
          }}
          onLanguages={() => {
            setPressing(false);
            setScanning(false);
            setOverlay({ kind: 'languages' });
          }}
        />

        {!showResult ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                ecoMode ? 'Switch to light filter' : 'Switch to dark filter'
              }
          onPress={() => {
            setEcoMode((value) => !value);
          }}
          style={({ pressed }) => [
            styles.filterButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={ecoMode ? 'moon-outline' : 'sunny-outline'}
            size={16}
            color={colors.foreground}
          />
        </Pressable>

        <View style={styles.sourceRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Recent scans"
            onPress={() => {
              setOverlay({ kind: 'history', demo: true });
            }}
            style={({ pressed }) => [
              styles.historyButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="time-outline"
              size={16}
              color={colors.foreground}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Source language"
            onPress={() => {
              setOverlay({ kind: 'languages' });
            }}
            style={({ pressed }) => [
              styles.sourceButton,
              source.code === 'auto' && styles.sourceButtonAuto,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="language-outline"
              size={14}
              color={
                source.code === 'auto' ? colors.accent : colors.foreground
              }
            />
            <Text
              style={[
                styles.sourceButtonText,
                source.code === 'auto' && styles.sourceButtonTextAuto,
              ]}
            >
              {source.code === 'auto'
                ? 'AUTO'
                : languageShortLabel(source.code)}
            </Text>
          </Pressable>
        </View>
          </>
        ) : null}

        <View style={styles.topBar}>
          <TopBar
            remaining={15}
            unlimited
            onOpenPaywall={noop}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0b0b0b',
  },
  phone: {
    width: 390,
    height: 780,
    overflow: 'hidden',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  filterButton: {
    position: 'absolute',
    left: 16,
    bottom: 92,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(10,10,10,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.65,
  },
  sourceRow: {
    position: 'absolute',
    right: 16,
    bottom: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(10,10,10,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(10,10,10,0.94)',
  },
  sourceButtonAuto: {
    borderColor: colors.accent,
  },
  sourceButtonText: {
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.foreground,
  },
  sourceButtonTextAuto: {
    color: colors.accent,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
  },
});
