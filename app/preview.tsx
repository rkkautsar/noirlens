import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AimHud } from '@/components/AimHud';
import { OriginalView } from '@/components/OriginalView';
import { ResultCard } from '@/components/ResultCard';
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
  sourceText: '금연 · 담배는 건강에 해롭습니다',
  translatedText:
    'No smoking. Cigarettes are harmful to your health and the people around you.',
  sourceLanguage: 'ko',
  sourceHash: 'preview',
  blocks: [
    { text: '금연', confidence: 0.94, x: 0.31, y: 0.3, width: 0.38, height: 0.07 },
    {
      text: '담배는 건강에 해롭습니다',
      confidence: 0.88,
      x: 0.2,
      y: 0.4,
      width: 0.6,
      height: 0.06,
    },
    {
      text: '간접흡연도 위험합니다',
      confidence: 0.81,
      x: 0.22,
      y: 0.49,
      width: 0.56,
      height: 0.06,
    },
  ],
  imageWidth: 720,
  imageHeight: 1280,
  cached: false,
  previewJpegBase64:
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
};

export default function PreviewScreen() {
  const [mode, setMode] = useState<Mode>('standby');
  const router = useRouter();
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
              />
            )}
          </ResultSheet>
        ) : (
          <>
            <Standby
              hidden={mode === 'aim'}
              remaining={15}
              error={null}
              onOpenLanguages={noop}
              onOpenPaywall={noop}
              onDismissError={noop}
            />
            {mode === 'aim' ? (
              <AimHud scanning={scanning} error={null} />
            ) : null}
          </>
        )}

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
            router.push('/languages');
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
              router.push('/history?demo=1');
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
              router.push('/languages');
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
