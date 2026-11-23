import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { LanguagesSheet } from '@/components/LanguagesSheet';
import { ModeTabs } from '@/components/ModeTabs';
import { LookupSheet } from '@/components/LookupSheet';
import { OverlaySheet } from '@/components/OverlaySheet';
import { ResultCard } from '@/components/ResultCard';
import { ScanShutter } from '@/components/ScanShutter';
import { MicroLabel, SolidButton } from '@/components/ui';
import { TopBar } from '@/components/TopBar';
import { isEnglishLanguageCode } from '@/constants/languages';
import type { ScanResult } from '@/scanner/machine';
import { captures } from '@/services/captures';
import { DEMO_HISTORY } from '@/services/demoHistory';
import {
  describeNativeError,
  isLanguagePackFailure,
} from '@/services/nativeErrors';
import { readScanHistory, type ScanHistoryEntry } from '@/services/scanHistory';
import { colors, typography } from '@/theme';
import vision from '../modules/native-vision-translator';

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
  const { id, captureId, block } = useLocalSearchParams<{
    id?: string;
    captureId?: string;
    block?: string;
  }>();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setResult(null);

    if (!captureId) {
      void readScanHistory()
        .then((rows) => {
          if (!active) {
            return;
          }
          const entry =
            rows.find((row) => row.id === id) ??
            DEMO_HISTORY.find((row) => row.id === id) ??
            null;
          if (entry) {
            setResult(resultFromEntry(entry));
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
    }

    void (async () => {
      await captures.hydrate().catch(() => {});
      if (!active) {
        return;
      }
      const record = captures.get(captureId);
      if (!record) {
        setLoading(false);
        return;
      }
      const index = block === undefined ? Number.NaN : Number.parseInt(block, 10);
      const selected = Number.isFinite(index) ? record.blocks[index] : undefined;
      const sourceText = (selected?.text ?? record.text).trim();
      const sourceLanguage = record.language || record.hint || 'und';
      const base = {
        sourceText,
        sourceLanguage,
        sourceHash: record.id,
        blocks: selected ? [selected] : record.blocks,
        imageWidth: record.width,
        imageHeight: record.height,
        cached: false,
      };
      if (sourceText.length === 0) {
        setLoading(false);
        return;
      }
      if (isEnglishLanguageCode(sourceLanguage)) {
        setResult({ ...base, kind: 'english', translatedText: '' });
        setLoading(false);
        return;
      }
      try {
        const out = await vision.translate({
          text: sourceText,
          sourceLanguage,
          targetLanguage: 'en',
        });
        if (!active) {
          return;
        }
        setResult({
          ...base,
          kind: 'translated',
          translatedText: out.translatedText,
        });
      } catch (nativeError) {
        if (!active) {
          return;
        }
        if (isLanguagePackFailure(nativeError)) {
          setResult({ ...base, kind: 'pack_missing', translatedText: '' });
        } else {
          setError(describeNativeError(nativeError).message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [captureId, block, id]);

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

  if (error) {
    return (
      <View style={styles.page}>
        <TopBar
          remaining={null}
          unlimited
          onOpenPaywall={() => {}}
          showNavigation={false}
        />
        <View style={styles.empty}>
          <MicroLabel tone="danger">TRANSLATION FAILED</MicroLabel>
          <Text style={styles.errorText}>{error}</Text>
          <SolidButton label="BACK" icon="arrow-back" onPress={close} />
        </View>
      </View>
    );
  }

  if (!result) {
    return (
      <View style={styles.page}>
        <TopBar
          remaining={null}
          unlimited
          onOpenPaywall={() => {}}
          showNavigation={false}
        />
        <View style={styles.empty}>
          <MicroLabel tone="dim">NOTHING TO SHOW</MicroLabel>
          <Text style={styles.errorText}>
            The capture has no recognized text, or it was deleted.
          </Text>
          <SolidButton label="BACK" icon="arrow-back" onPress={close} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ResultCard
        result={result}
        remaining={null}
        unlimited
        readOnly
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
      <ScanShutter
        next
        active={false}
        scanning={false}
        onStart={close}
        onCapture={() => {}}
        onCancel={close}
        onLanguages={() => setOverlay({ kind: 'languages' })}
        readOnly
      />
      <ModeTabs
        active="camera"
        onCamera={close}
        onTranslate={() => router.push('/translate')}
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
    gap: 12,
    paddingHorizontal: 24,
  },
  errorText: {
    ...typography.body,
    color: colors.muted,
    textAlign: 'center',
  },
});
