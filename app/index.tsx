import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AimHud } from '@/components/AimHud';
import { CaptureFlight } from '@/components/CaptureFlight';
import { ScreenShell, useShellLayout } from '@/components/ScreenShell';
import { useSheet } from '@/components/SheetHost';
import { ResultActions, ResultBody } from '@/components/ResultView';
import { InspectActions, InspectBody, useInspect } from '@/components/InspectView';
import { ScanShutter } from '@/components/ScanShutter';
import { Standby } from '@/components/Standby';

import { languageShortLabel } from '@/constants/languages';
import { useScanner } from '@/scanner/useScanner';
import {
  readEcoPreviewPreference,
  writeEcoPreviewPreference,
} from '@/services/preferences';
import { useSourceLanguage } from '@/services/sourceLanguage';
import { captures, useCaptures } from '@/services/captures';
import type { CaptureRecord } from '@/services/captureModel';
import { colors, layout, typography } from '@/theme';
import vision, { EcoCameraView } from '../modules/native-vision-translator';

function CameraPanel({ children }: { children: React.ReactNode }) {
  const { headerHeight, footerHeight } = useShellLayout();
  return (
    <View style={[styles.panelFill, { top: headerHeight, bottom: footerHeight }]}>
      {children}
    </View>
  );
}

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
  const { openSheet, sheetOpen } = useSheet();

  const { snapshot } = scanner;
  const { state, result } = snapshot;
  const inspectState = useInspect(result, undefined, result?.sourceHash);
  const active = state === 'PREWARM' || state === 'SCANNING';
  const locked = state === 'LOCKED_READ' && result !== null;
  const exhausted =
    snapshot.remainingToday === 0 && snapshot.captureMode === 'read';

  const routeParams = useLocalSearchParams<{ history?: string }>();
  const historyParam = useRef(routeParams.history);
  historyParam.current = routeParams.history;
  useFocusEffect(
    useCallback(() => {
      const value = historyParam.current;
      const tab =
        value === 'captures' || value === 'translations' ? value : null;
      if (tab) {
        openSheet({ kind: 'history', initialTab: tab });
        router.setParams({ history: '' });
      }
    }, [openSheet, router]),
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
    openSheet({ kind: 'languages' });
  };
  const openLookup = (phrase: string, alt?: string) => {
    const query = phrase.trim();
    if (!query) {
      return;
    }
    openSheet({ kind: 'lookup', q: query, alt });
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
      onStartShouldSetResponder={() => !locked && !sheetOpen}
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
      <ScreenShell
        mode="camera"
        remaining={snapshot.remainingToday}
        unlimited={snapshot.unlimited}
        onPaywall={openPaywall}
        onCamera={() => {}}
        onTranslate={() => router.push('/translate')}
        backdrop={
          <EcoCameraView style={StyleSheet.absoluteFill} ecoMode={ecoMode} />
        }
        actions={
          showOriginal && result ? (
            <InspectActions
              controller={inspectState}
              onClose={() => {
                inspectState.reset();
                setShowOriginal(false);
              }}
              onScanAgain={scanner.scanAgain}
              onOpenLanguages={openLanguages}
              onLookUp={openLookup}
            />
          ) : locked ? (
            <ResultActions
              result={result}
              onScanAgain={scanner.scanAgain}
              onShowOriginal={() => setShowOriginal(true)}
              thumbnail={
                result.previewUri ??
                (result.previewJpegBase64
                  ? `data:image/jpeg;base64,${result.previewJpegBase64}`
                  : undefined)
              }
              onOpenLanguages={openLanguages}
            />
          ) : undefined
        }
        dock={
          locked && exhausted ? undefined : (
          <>
            {!locked ? (
              <View style={styles.cameraUtilities}>
                <View style={styles.utilityGroup}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      ecoMode
                        ? 'Switch to light filter'
                        : 'Switch to dark filter'
                    }
                    onPress={() => {
                      void Haptics.impactAsync(
                        Haptics.ImpactFeedbackStyle.Light,
                      ).catch(() => {});
                      updateEcoMode(!ecoMode);
                    }}
                    style={({ pressed }) => [
                      styles.utilityButton,
                      pressed && styles.sourceButtonPressed,
                    ]}
                  >
                    <Ionicons
                      name={ecoMode ? 'moon-outline' : 'sunny-outline'}
                      size={16}
                      color={colors.foreground}
                    />
                  </Pressable>
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
                        snapshot.captureMode === 'collect'
                          ? 'read'
                          : 'collect',
                      );
                    }}
                    style={({ pressed }) => [
                      styles.utilityButton,
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
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
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
                      styles.utilityButton,
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
                </View>
                <View style={styles.utilityGroup}>
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
                      color={
                        source.code === 'auto'
                          ? colors.accent
                          : colors.foreground
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
                        openSheet({
                          kind: 'history',
                          initialTab:
                            snapshot.captureMode === 'collect'
                              ? 'captures'
                              : 'translations',
                        });
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
              </View>
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
          </>
          )
        }
        overlay={
          flight && flightTarget ? (
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
          ) : undefined
        }
      >
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
        {showOriginal && result ? (
          <CameraPanel>
            <InspectBody controller={inspectState} />
          </CameraPanel>
        ) : locked ? (
          <CameraPanel>
            <ScrollView
              style={styles.resultScroll}
              contentContainerStyle={styles.resultContent}
            >
              <ResultBody
                result={result}
                remaining={snapshot.remainingToday}
                unlimited={snapshot.unlimited}
                onLookUp={openLookup}
              />
            </ScrollView>
          </CameraPanel>
        ) : null}
      </ScreenShell>


    </View>
  );
}
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  cameraUtilities: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.page,
    paddingBottom: 4,
  },
  utilityGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.background,
  },
  resultScroll: {
    flex: 1,
  },
  resultContent: {
    paddingHorizontal: layout.page,
    paddingTop: layout.contentTop,
    paddingBottom: layout.page,
    gap: layout.section,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeButton: {
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
  utilityButton: {
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
