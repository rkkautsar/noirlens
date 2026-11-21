import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AimHud } from '@/components/AimHud';
import { OriginalView } from '@/components/OriginalView';
import { ResultCard } from '@/components/ResultCard';
import { ScanShutter } from '@/components/ScanShutter';
import { Standby } from '@/components/Standby';
import { useScanner } from '@/scanner/useScanner';
import {
  readEcoPreviewPreference,
  writeEcoPreviewPreference,
} from '@/services/preferences';
import { colors } from '@/theme';
import { EcoCameraView } from '../modules/native-vision-translator';

export default function ScannerScreen() {
  const router = useRouter();
  const scanner = useScanner();
  const [ecoMode, setEcoMode] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const { snapshot } = scanner;
  const { state, result } = snapshot;
  const active = state === 'PREWARM' || state === 'SCANNING';
  const locked = state === 'LOCKED_READ' && result !== null;
  const standby = state === 'SLEEP' || (state === 'LOCKED_READ' && result === null);
  const exhausted = snapshot.remainingToday === 0;

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
  const openPaywall = () => {
    router.push('/paywall');
  };

  const beginNext = () => {
    scanner.scanAgain();
    scanner.beginHold();
  };

  return (
    <View style={styles.root}>
      <EcoCameraView style={StyleSheet.absoluteFill} ecoMode={ecoMode} />

      {locked ? (
        showOriginal ? (
          <OriginalView
            result={result}
            remaining={snapshot.remainingToday}
            unlimited={snapshot.unlimited}
            ecoMode={ecoMode}
            onEcoChange={updateEcoMode}
            onClose={() => {
              setShowOriginal(false);
            }}
            onScanAgain={scanner.scanAgain}
            onOpenLanguages={openLanguages}
            onOpenPaywall={openPaywall}
          />
        ) : (
          <ResultCard
            result={result}
            remaining={snapshot.remainingToday}
            unlimited={snapshot.unlimited}
            ecoMode={ecoMode}
            onEcoChange={updateEcoMode}
            onScanAgain={scanner.scanAgain}
            onShowOriginal={() => {
              setShowOriginal(true);
            }}
            onOpenLanguages={openLanguages}
            onOpenPaywall={openPaywall}
          />
        )
      ) : (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPressIn={scanner.beginHold}
          onPressOut={scanner.captureNow}
        >
          {active ? (
            <AimHud
              scanning={state === 'SCANNING'}
              ecoMode={ecoMode}
              onEcoChange={updateEcoMode}
              remaining={snapshot.remainingToday}
              unlimited={snapshot.unlimited}
              error={snapshot.error}
              onStop={scanner.stop}
              onOpenLanguages={openLanguages}
              onOpenPaywall={openPaywall}
            />
          ) : null}
          {standby ? (
            <Standby
              remaining={snapshot.remainingToday}
              unlimited={snapshot.unlimited}
              hydrated={snapshot.hydrated}
              error={snapshot.error}
              ecoMode={ecoMode}
              onEcoChange={updateEcoMode}
              onOpenLanguages={openLanguages}
              onOpenPaywall={openPaywall}
              onDismissError={scanner.dismissError}
            />
          ) : null}
        </Pressable>
      )}

      {!exhausted ? (
        <ScanShutter
          next={locked}
          active={state === 'PREWARM'}
          scanning={state === 'SCANNING'}
          onStart={locked ? beginNext : scanner.beginHold}
          onCapture={scanner.captureNow}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
