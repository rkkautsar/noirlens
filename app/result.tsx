import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { LanguagesSheet } from '@/components/LanguagesSheet';
import { LookupSheet } from '@/components/LookupSheet';
import { OverlaySheet } from '@/components/OverlaySheet';
import { ResultCard } from '@/components/ResultCard';
import { SolidButton } from '@/components/ui';
import { TopBar } from '@/components/TopBar';
import type { ScanResult } from '@/scanner/machine';
import { DEMO_HISTORY } from '@/services/demoHistory';
import { readScanHistory, type ScanHistoryEntry } from '@/services/scanHistory';
import { colors } from '@/theme';

type Overlay =
  | { kind: 'lookup'; q: string; alt?: string }
  | { kind: 'languages' }
  | null;

function resultFromEntry(entry: ScanHistoryEntry): ScanResult {
  const lines = entry.sourceText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    kind: entry.kind,
    sourceText: entry.sourceText,
    translatedText: entry.translatedText,
    sourceLanguage: entry.sourceLanguage,
    sourceHash: entry.id,
    blocks: lines.map((text, index) => ({
      text,
      confidence: 1,
      x: 0.08,
      y: 0.1 + index * 0.08,
      width: 0.84,
      height: 0.06,
    })),
    imageWidth: 1000,
    imageHeight: 1000,
    cached: false,
  };
}

export default function ResultScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [entry, setEntry] = useState<ScanHistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [overlay, setOverlay] = useState<Overlay>(null);

  useEffect(() => {
    let active = true;
    void readScanHistory()
      .then((rows) => {
        if (active) {
          setEntry(
            rows.find((row) => row.id === id) ??
              DEMO_HISTORY.find((row) => row.id === id) ??
              null,
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id]);

  const close = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  if (loading) {
    return (
      <View style={styles.page}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={styles.page}>
        <TopBar
          remaining={null}
          unlimited
          onOpenPaywall={() => {}}
          showNavigation={false}
        />
        <View style={styles.empty}>
          <SolidButton label="BACK" icon="arrow-back" onPress={close} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ResultCard
        result={resultFromEntry(entry)}
        remaining={null}
        unlimited
        onScanAgain={close}
        onOpenLanguages={() => setOverlay({ kind: 'languages' })}
        onLookUp={(phrase, alt) => {
          const q = phrase.trim();
          if (q) {
            setOverlay({ kind: 'lookup', q, alt });
          }
        }}
      />
      <TopBar
        remaining={null}
        unlimited
        onOpenPaywall={() => {}}
        showNavigation={false}
      />
      {overlay ? (
        <OverlaySheet onClose={() => setOverlay(null)}>
          {overlay.kind === 'lookup' ? (
            <LookupSheet
              q={overlay.q}
              alt={overlay.alt}
              onClose={() => setOverlay(null)}
            />
                    ) : (
            <LanguagesSheet onClose={() => setOverlay(null)} />
          )}
        </OverlaySheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
