import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AimHud } from '@/components/AimHud';
import { CaptureFlight } from '@/components/CaptureFlight';
import { HistorySheet } from '@/components/HistorySheet';
import { LanguagesSheet } from '@/components/LanguagesSheet';
import { LookupSheet } from '@/components/LookupSheet';
import { ModeTabs } from '@/components/ModeTabs';
import { AppSheet } from '@/components/AppSheet';
import { OriginalView } from '@/components/OriginalView';
import { ResultCard } from '@/components/ResultCard';
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
import { captures, useCaptures } from '@/services/captures';
import { consumeCaptureHistory } from '@/services/historyIntent';
import type { CaptureRecord } from '@/services/captureModel';
import { colors, typography } from '@/theme';
import vision, { EcoCameraView } from '../modules/native-vision-translator';

export default function ScannerScreen() {
  const router = useRouter();
  const [flight, setFlight] = useState<CaptureRecord | null>(null);
  const [flightTarget, setFlightTarget] = useState<{ x: number; y: number } | null>(null);
  const { unreviewed } = useCaptures();
  const historyRef = useRef<ComponentRef<typeof View> | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const scanner = useScanner({
    onCaptureSaved: (record) => {
      setFlight(record);
      setFlightTarget(null);
    },
  });
  const insets = useSafeAreaInsets();
  const source = useSourceLanguage();
  const [ecoMode, setEcoMode] = useState(true);
  // Torch is deliberately session-only: never persisted, off after relaunch,
  // and the native side only lights it while the camera session runs.
  const [torch, setTorch] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [overlay, setOverlay] = useState<
    | { kind: 'lookup'; q: string; alt?: string }
    | { kind: 'languages' }
    | { kind: 'history' }
    | null
  >(null);

  const { snapshot } = scanner;
  const { state, result } = snapshot;
  const active = state === 'PREWARM' || state === 'SCANNING';
  const locked = state === 'LOCKED_READ' && result !== null;
  const exhausted =
    snapshot.remainingToday === 0 && snapshot.captureMode === 'read';

  useFocusEffect(
    useCallback(() => {
      if (consumeCaptureHistory()) {
        setOverlay({ kind: 'history' });
      }
    }, []),
  );

  useEffect(() => {
    if (!flight) {
      return;
    }
    const timer = setTimeout(() => {
      historyRef.current?.measureInWindow((x, y, width, height) => {
        setFlightTarget({ x: x + width / 2, y: y + height / 2 });
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [flight]);

  const pulseHistory = () => {
    pulse.setValue(1);
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1.16,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();
  };

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
    if (state === 'PREWARM' || state === 'SCANNING') {
      scanner.stop();
    }
    setOverlay({ kind: 'languages' });
  };
  const openLookup = (phrase: string, alt?: string) => {
    const query = phrase.trim();
    if (!query) {
      return;
    }
    setOverlay({ kind: 'lookup', q: query, alt });
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
      onStartShouldSetResponder={() => !locked && overlay === null}
      onResponderGrant={() => {
        if (Platform.OS !== 'web') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {},
          );
        }
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
        collect={snapshot.captureMode === 'collect'}
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
      {locked && showOriginal ? (
        <OriginalView
          result={result}
          onClose={() => {
            setShowOriginal(false);
          }}
          onScanAgain={scanner.scanAgain}
          onOpenLanguages={openLanguages}
          onLookUp={openLookup}
        />
      ) : locked ? (
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
          collect={snapshot.captureMode === 'collect'}
        />
      ) : null}


      {!locked ? (
        <View
          style={[
            styles.sourceRow,
            { bottom: insets.bottom + 92 },
          ]}
        >
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
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <Pressable
              ref={historyRef}
              accessibilityRole="button"
              accessibilityLabel={
                snapshot.captureMode === 'collect'
                  ? 'Review captures'
                  : 'Recent scans'
              }
              onPress={() => {
                scanner.stop();
                setOverlay({ kind: 'history' });
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
              {unreviewed > 0 ? (
                <View style={styles.historyBadge}>
                  <Text style={styles.historyBadgeText}>
                    {unreviewed > 99 ? '99+' : unreviewed}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        </View>
      ) : null}

      {!locked ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={
            snapshot.captureMode === 'collect'
              ? 'Collect mode on. Switch to Read mode.'
              : 'Collect mode off. Switch to Collect mode.'
          }
          accessibilityState={{
            checked: snapshot.captureMode === 'collect',
            disabled: active,
          }}
          disabled={active}
          onPress={() => {
            void Haptics.impactAsync(
              Haptics.ImpactFeedbackStyle.Light,
            ).catch(() => {});
            scanner.setCaptureMode(
              snapshot.captureMode === 'collect' ? 'read' : 'collect',
            );
          }}
          style={({ pressed }) => [
            styles.modeButton,
            { bottom: insets.bottom + 92 },
            snapshot.captureMode === 'collect' && styles.torchButtonOn,
            active && styles.controlDisabled,
            pressed && styles.sourceButtonPressed,
          ]}
        >
          <Ionicons
            name={
              snapshot.captureMode === 'collect'
                ? 'layers'
                : 'layers-outline'
            }
            size={16}
            color={
              snapshot.captureMode === 'collect'
                ? colors.accent
                : colors.foreground
            }
          />
        </Pressable>
      ) : null}

      {!locked ? (
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

      {!locked ? (
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
      <ModeTabs
        active="camera"
        onCamera={() => {}}
        onTranslate={() => router.push('/translate')}
      />

      {flight && flightTarget ? (
        <View pointerEvents="none" style={styles.flightLayer}>
          <CaptureFlight
            key={flight.id}
            thumbnail={captures.uriFor(flight.thumb)}
            targetX={flightTarget.x}
            targetY={flightTarget.y}
            onDone={() => {
              setFlight(null);
              setFlightTarget(null);
              pulseHistory();
            }}
          />
        </View>
      ) : null}

      <AppSheet visible={overlay !== null} onClose={() => setOverlay(null)}>
        {overlay?.kind === 'lookup' ? (
          <LookupSheet
            q={overlay.q}
            alt={overlay.alt}
            onClose={() => setOverlay(null)}
          />
        ) : overlay?.kind === 'languages' ? (
          <LanguagesSheet onClose={() => setOverlay(null)} />
        ) : overlay ? (
          <HistorySheet
            initialTab={
              snapshot.captureMode === 'collect' ? 'captures' : 'translations'
            }
            onClose={() => setOverlay(null)}
          />
        ) : null}
      </AppSheet>
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
  modeButton: {
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
  torchButton: {
    position: 'absolute',
    left: 108,
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
  flightLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 30,
  },
  historyBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBadgeText: {
    color: colors.background,
    fontSize: 9,
    fontWeight: '700',
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
  controlDisabled: {
    opacity: 0.4,
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
