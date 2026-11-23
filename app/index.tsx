import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AimHud } from '@/components/AimHud';
import { OriginalView } from '@/components/OriginalView';
import { ResultCard } from '@/components/ResultCard';
import { ResultSheet } from '@/components/ResultSheet';
import { ScanShutter } from '@/components/ScanShutter';
import { Standby } from '@/components/Standby';
import { TopBar } from '@/components/TopBar';
import { languageShortLabel } from '@/constants/languages';
import { useScanner } from '@/scanner/useScanner';
import {
  readEcoPreviewPreference,
  writeEcoPreviewPreference,
} from '@/services/preferences';
import { useSourceLanguage } from '@/services/sourceLanguage';
import { colors, typography } from '@/theme';
import vision, { EcoCameraView } from '../modules/native-vision-translator';

export default function ScannerScreen() {
  const router = useRouter();
  const scanner = useScanner();
  const insets = useSafeAreaInsets();
  const source = useSourceLanguage();
  const [ecoMode, setEcoMode] = useState(true);
  // Torch is deliberately session-only: never persisted, off after relaunch,
  // and the native side only lights it while the camera session runs.
  const [torch, setTorch] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const { snapshot } = scanner;
  const { state, result } = snapshot;
  const active = state === 'PREWARM' || state === 'SCANNING';
  const locked = state === 'LOCKED_READ' && result !== null;
  const exhausted = snapshot.remainingToday === 0;

  useEffect(() => {
    if (!snapshot.error) {
      return;
    }
    const timer = setTimeout(() => {
      scanner.dismissError();
    }, 6000);
    return () => clearTimeout(timer);
  }, [snapshot.error, scanner.dismissError]);

  const lastSourceRef = useRef(source.code);
  useEffect(() => {
    if (!locked) {
      lastSourceRef.current = source.code;
      return;
    }
    if (lastSourceRef.current === source.code) {
      return;
    }
    lastSourceRef.current = source.code;
    void scanner.rescan(source.code);
  }, [locked, source.code, scanner]);

  useEffect(() => {
    let cancelled = false;
    void readEcoPreviewPreference()
      .then((preference) => {
        if (!cancelled && preference !== null) {
          setEcoMode(preference);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setShowOriginal(false);
  }, [result?.sourceHash]);

  useEffect(() => {
    if (!locked) {
      setShowOriginal(false);
    }
  }, [locked]);

  const updateEcoMode = (value: boolean) => {
    setEcoMode(value);
    void writeEcoPreviewPreference(value).catch(() => {});
  };

  const openLanguages = () => {
    router.push('/languages');
  };
  const openLookup = (phrase: string, alt?: string) => {
    const query = phrase.trim();
    if (!query) {
      return;
    }
    router.push({
      pathname: '/lookup',
      params: alt ? { q: query, alt } : { q: query },
    });
  };

  const openPaywall = () => {
    router.push('/paywall');
  };

  const beginNext = () => {
    scanner.scanAgain();
    scanner.beginHold();
  };

  return (
    <View
      style={styles.root}
      onStartShouldSetResponder={() => !locked}
      onResponderGrant={() => {
        scanner.beginHold();
      }}
      onResponderRelease={() => {
        scanner.captureNow();
      }}
      onResponderTerminate={() => {
        scanner.captureNow();
      }}
      onResponderTerminationRequest={() => false}
    >
      <EcoCameraView style={StyleSheet.absoluteFill} ecoMode={ecoMode} />

      <Standby
        hidden={active}
        remaining={snapshot.remainingToday}
        error={snapshot.error}
        onOpenLanguages={openLanguages}
        onOpenPaywall={openPaywall}
        onDismissError={scanner.dismissError}
      />
      {active ? (
        <AimHud
          scanning={state === 'SCANNING'}
          error={snapshot.error}
          onReticleFrame={scanner.setReticleFrame}
        />
      ) : null}
      {locked ? (
        <ResultSheet onDismiss={scanner.stop}>
          {showOriginal ? (
            <OriginalView
              result={result}
              onClose={() => {
                setShowOriginal(false);
              }}
              onScanAgain={scanner.scanAgain}
              onOpenLanguages={openLanguages}
              onLookUp={openLookup}
            />
          ) : (
            <ResultCard
              result={result}
              remaining={snapshot.remainingToday}
              unlimited={snapshot.unlimited}
              onScanAgain={scanner.scanAgain}
              onShowOriginal={() => {
                setShowOriginal(true);
              }}
              onOpenLanguages={openLanguages}
              onLookUp={openLookup}
            />
          )}
        </ResultSheet>
      ) : null}

      {!exhausted ? (
        <ScanShutter
          next={locked}
          active={state === 'PREWARM'}
          scanning={state === 'SCANNING'}
          onStart={locked ? beginNext : scanner.beginHold}
          onCapture={scanner.captureNow}
          onCancel={locked ? scanner.scanAgain : scanner.stop}
          onLanguages={openLanguages}
        />
      ) : null}

      {!exhausted && !locked ? (
        <View style={[styles.sourceRow, { bottom: insets.bottom + 92 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Recent scans"
            onPress={() => {
              router.push('/history');
            }}
            style={({ pressed }) => [
              styles.historyButton,
              pressed && styles.sourceButtonPressed,
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
            accessibilityLabel={
              source.code === 'auto'
                ? 'Source language: Auto. Open language settings.'
                : `Source language: ${languageShortLabel(source.code)}. Open language settings.`
            }
            onPress={openLanguages}
            style={({ pressed }) => [
              styles.sourceButton,
              source.code === 'auto' && styles.sourceButtonAuto,
              pressed && styles.sourceButtonPressed,
            ]}
          >
            <Ionicons
              name="language-outline"
              size={14}
              color={source.code === 'auto' ? colors.accent : colors.foreground}
            />
            <Text
              style={[
                styles.sourceButtonText,
                source.code === 'auto' && styles.sourceButtonTextAuto,
              ]}
            >
              {source.code === 'auto' ? 'AUTO' : languageShortLabel(source.code)}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {!exhausted && !locked ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            torch ? 'Turn torch off' : 'Turn torch on'
          }
          accessibilityState={{ checked: torch }}
          onPress={() => {
            void Haptics.impactAsync(
              Haptics.ImpactFeedbackStyle.Light,
            ).catch(() => {});
            const next = !torch;
            setTorch(next);
            void vision.setTorch(next).catch(() => {});
          }}
          style={({ pressed }) => [
            styles.torchButton,
            { bottom: insets.bottom + 92 },
            torch && styles.torchButtonOn,
            pressed && styles.sourceButtonPressed,
          ]}
        >
          <Ionicons
            name={torch ? 'flashlight' : 'flashlight-outline'}
            size={16}
            color={torch ? colors.accent : colors.foreground}
          />
        </Pressable>
      ) : null}

      {!exhausted && !locked ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            ecoMode ? 'Switch to light filter' : 'Switch to dark filter'
          }
          onPress={() => {
            void Haptics.impactAsync(
              Haptics.ImpactFeedbackStyle.Light,
            ).catch(() => {});
            updateEcoMode(!ecoMode);
          }}
          style={({ pressed }) => [
            styles.filterButton,
            { bottom: insets.bottom + 92 },
            pressed && styles.sourceButtonPressed,
          ]}
        >
          <Ionicons
            name={ecoMode ? 'moon-outline' : 'sunny-outline'}
            size={16}
            color={colors.foreground}
          />
        </Pressable>
      ) : null}

      <View style={styles.topBar}>
        <TopBar
          remaining={snapshot.remainingToday}
          unlimited={snapshot.unlimited}
          onOpenPaywall={openPaywall}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
  },
  sourceRow: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  torchButton: {
    position: 'absolute',
    left: 62,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(10,10,10,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchButtonOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  filterButton: {
    position: 'absolute',
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(10,10,10,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
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
  sourceButtonPressed: {
    opacity: 0.7,
  },
  sourceButtonText: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.foreground,
  },
  sourceButtonTextAuto: {
    color: colors.accent,
  },
});
