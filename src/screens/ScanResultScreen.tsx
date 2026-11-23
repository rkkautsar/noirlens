import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppSheet } from '@/components/AppSheet';
import { ScreenShell } from '@/components/ScreenShell';
import { LanguagePickerSheet } from '@/components/LanguagePickerSheet';
import { LanguagesSheet } from '@/components/LanguagesSheet';
import { LookupSheet } from '@/components/LookupSheet';
import { ResultActions, ResultBody } from '@/components/ResultCard';
import { ScanShutter } from '@/components/ScanShutter';
import { OriginalView } from '@/components/OriginalView';
import { ChipButton, MicroLabel, SolidButton } from '@/components/ui';
import {
  isEnglishLanguageCode,
  languageShortLabel,
} from '@/constants/languages';
import type { ScanResult } from '@/scanner/machine';
import { captures, useCaptures } from '@/services/captures';
import { resumeCaptureProcessing } from '@/services/captureProcessing';
import { clearCaptureHistory } from '@/services/historyIntent';
import { useScanAllowance } from '@/services/allowance';
import type { CaptureRecord } from '@/services/captureModel';
import { rerunCaptureOcr, retryCapture } from '@/services/captureProcessing';
import { DEMO_HISTORY } from '@/services/demoHistory';
import {
  describeNativeError,
  isLanguagePackFailure,
  isUnsupportedLanguagePair,
} from '@/services/nativeErrors';
import { readScanHistory, type ScanHistoryEntry } from '@/services/scanHistory';
import { colors, radius, spacing, typography } from '@/theme';
import vision from '../../modules/native-vision-translator';

type Overlay =
  | { kind: 'lookup'; q: string; alt?: string }
  | { kind: 'languages' }
  | { kind: 'languagePicker' }
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

function captureBase(record: CaptureRecord): ScanResult {
  return {
    kind: 'translated',
    sourceText: record.text,
    translatedText: '',
    sourceLanguage: record.language || record.hint || 'und',
    sourceHash: record.id,
    blocks: record.blocks,
    imageWidth: record.width,
    imageHeight: record.height,
    cached: false,
  };
}

export function ScanResultScreen({
  captureId,
  scanId,
}: {
  captureId?: string;
  scanId?: string;
}) {
  const router = useRouter();
  const { records, loaded } = useCaptures();
  const record = captureId
    ? records.find((row) => row.id === captureId) ?? null
    : null;

  const [entry, setEntry] = useState<ScanHistoryEntry | null>(null);
  const [loading, setLoading] = useState(!captureId);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [inspect, setInspect] = useState(false);
  const [captureResult, setCaptureResult] = useState<ScanResult | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [languageBusy, setLanguageBusy] = useState(false);
  const [packBusy, setPackBusy] = useState(false);
  const [captureNonce, setCaptureNonce] = useState(0);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const allowance = useScanAllowance();
  const unlimited = allowance.unlimited;
  const pendingHint = useRef<string | null>(null);
  const translatedKey = useRef<string | null>(null);
  const requestToken = useRef(0);
  const packBusyRef = useRef(false);

  useEffect(() => {
    if (captureId) {
      void captures
        .hydrate()
        .then(() => resumeCaptureProcessing())
        .catch(() => {});
      return;
    }
    let active = true;
    void readScanHistory()
      .then((rows) => {
        if (active) {
          setEntry(
            rows.find((row) => row.id === scanId) ??
              DEMO_HISTORY.find((row) => row.id === scanId) ??
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
  }, [captureId, scanId]);

  // Mark a reviewed capture once its OCR is done.
  useEffect(() => {
    if (!record || record.status !== 'done' || record.reviewedAt !== null) {
      return;
    }
    void captures.review(record.id).catch(() => {});
  }, [record]);

  // Translate the capture's OCR text whenever the language or revision changes.
  useEffect(() => {
    if (!captureId || !record || record.status !== 'done') {
      return;
    }
    const key = `${record.id}:${record.ocrRevision}:${record.language}:${record.text.length}:${captureNonce}`;
    if (translatedKey.current === key) {
      return;
    }
    const base = captureBase(record);
    const text = record.text.trim();
    setCaptureError(null);
    setCaptureResult(null);
    setTranslating(false);
    if (!text) {
      translatedKey.current = key;
      return;
    }
    if (isEnglishLanguageCode(base.sourceLanguage)) {
      translatedKey.current = key;
      setCaptureResult({ ...base, kind: 'english', translatedText: '' });
      return;
    }
    const token = requestToken.current + 1;
    requestToken.current = token;
    setTranslating(true);
    // Let a dismissing native sheet finish before Apple Translation presents.
    const timer = setTimeout(() => {
      if (token !== requestToken.current) {
        return;
      }
      translatedKey.current = key;
      void vision
        .translate({
        text,
          sourceLanguage: base.sourceLanguage,
          targetLanguage: 'en',
        })
        .then((out) => {
          if (token !== requestToken.current) {
            return;
          }
          setCaptureResult({
            ...base,
            kind: 'translated',
            translatedText: out.translatedText,
          });
        })
        .catch((error) => {
          if (token !== requestToken.current) {
            return;
          }
          if (isUnsupportedLanguagePair(error)) {
          setCaptureError(
            `${languageShortLabel(base.sourceLanguage)} to English is not supported on this device.`,
          );
        } else if (isLanguagePackFailure(error)) {
            setCaptureResult({ ...base, kind: 'pack_missing', translatedText: '' });
          } else {
            setCaptureError(describeNativeError(error).message);
          }
        })
        .finally(() => {
          if (token === requestToken.current) {
            setTranslating(false);
          }
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [captureId, record, captureNonce]);

  const close = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const applyOcrLanguage = (next: string) => {
    if (!record) {
      return;
    }
    pendingHint.current = next;
    setLanguageBusy(true);
    setOcrError(null);
    setCaptureResult(null);
    setTranslating(false);
    translatedKey.current = null;
    requestToken.current += 1;
    void rerunCaptureOcr(record.id, next)
      .catch(() => {
        setOcrError('Could not change the OCR language. Try again.');
      })
      .finally(() => {
        setLanguageBusy(false);
      });
  };

  const chooseLanguage = (code: string) => {
    setOverlay(null);
    if (!record) {
      return;
    }
    const next = code === 'auto' ? '' : code;
    if (next === record.hint) {
      return;
    }
    applyOcrLanguage(next);
  };

  const retryOcrLanguage = () => {
    const next = pendingHint.current;
    if (next === null || !record) {
      return;
    }
    applyOcrLanguage(next);
  };

  const preparePack = async () => {
    if (!record || packBusyRef.current) {
      return;
    }
    packBusyRef.current = true;
    setPackBusy(true);
    setCaptureError(null);
    try {
      const status = await vision.prepareLanguagePack(
        record.language || record.hint || 'und',
        'en',
      );
      if (status.status !== 'installed') {
        setCaptureResult(null);
        setCaptureError('The pack did not finish installing. Try again.');
        return;
      }
      translatedKey.current = null;
      setCaptureNonce((value) => value + 1);
    } catch (error) {
      setCaptureResult(null);
      setCaptureError(describeNativeError(error).message);
    } finally {
      packBusyRef.current = false;
      setPackBusy(false);
    }
  };

  const retryTranslation = () => {
    setCaptureError(null);
    setCaptureResult(null);
    translatedKey.current = null;
    requestToken.current += 1;
    setCaptureNonce((value) => value + 1);
  };

  const remaining = allowance.remaining;
  const newScan = () => {
    clearCaptureHistory();
    close();
  };
  const historyResult = entry ? resultFromEntry(entry) : null;
  const result = captureId ? captureResult : historyResult;
  const captureText = record?.text.trim() ?? '';
  const pending = record
    ? record.status === 'pending' || record.status === 'processing'
    : false;
  const waiting = Boolean(
    captureId &&
      (!loaded ||
        pending ||
        (record?.status === 'done' &&
          captureText.length > 0 &&
          !captureResult &&
          !captureError) ||
        translating ||
        packBusy),
  );

  return (
    <View style={styles.page}>
      <ScreenShell
        mode="camera"
        remaining={remaining}
        unlimited={unlimited}
        onPaywall={() => router.push('/paywall')}
        onCamera={newScan}
        onTranslate={() => router.push('/translate')}
        actions={
          result ? (
            <ResultActions
              result={result}
              onScanAgain={newScan}
              onShowOriginal={
                captureId && record ? () => setInspect(true) : undefined
              }
              thumbnail={
                captureId && record ? captures.uriFor(record.thumb) : undefined
              }
              onPreparePack={captureId ? preparePack : undefined}
              onOpenLanguages={() =>
                setOverlay(
                  captureId ? { kind: 'languagePicker' } : { kind: 'languages' },
                )
              }
            />
          ) : undefined
        }
        dock={
          <ScanShutter
            next
            active={false}
            scanning={false}
            onStart={newScan}
            onCapture={() => {}}
            onCancel={close}
            onLanguages={() =>
              setOverlay(
                captureId ? { kind: 'languagePicker' } : { kind: 'languages' },
              )
            }
          />
        }
        overlay={
          inspect && record && captureResult ? (
            <OriginalView
              result={captureResult}
              imageUri={captures.uriFor(record.thumb)}
              onClose={() => setInspect(false)}
              onScanAgain={newScan}
              onOpenLanguages={() => setOverlay({ kind: 'languagePicker' })}
              onLookUp={(phrase, alt) => {
                const q = phrase.trim();
                if (q) {
                  setOverlay({ kind: 'lookup', q, alt });
                }
              }}
            />
          ) : undefined
        }
      >
        {result ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
          >
            <ResultBody
              result={result}
              remaining={remaining}
              unlimited={unlimited}
              onLookUp={(phrase, alt) => {
                const q = phrase.trim();
                if (q) {
                  setOverlay({ kind: 'lookup', q, alt });
                }
              }}
            />
          </ScrollView>
        ) : (
          <View style={styles.center}>
            {!captureId && loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : !captureId ? (
              <>
                <MicroLabel tone="dim">RESULT NOT FOUND</MicroLabel>
                <SolidButton label="BACK" icon="arrow-back" onPress={close} />
              </>
            ) : !loaded ? (
              <ActivityIndicator color={colors.accent} />
            ) : !record ? (
              <>
                <MicroLabel tone="dim">CAPTURE NOT FOUND</MicroLabel>
                <SolidButton label="BACK" icon="arrow-back" onPress={close} />
              </>
            ) : ocrError ? (
              <View style={styles.statePanel}>
                <MicroLabel tone="danger">OCR LANGUAGE</MicroLabel>
                <Text style={styles.stateText}>{ocrError}</Text>
                <ChipButton
                  label="RETRY OCR LANGUAGE"
                  icon="refresh"
                  active
                  disabled={languageBusy}
                  onPress={retryOcrLanguage}
                />
              </View>
            ) : captureError ? (
              <View style={styles.statePanel}>
                <MicroLabel tone="danger">TRANSLATION FAILED</MicroLabel>
                <Text style={styles.stateText}>{captureError}</Text>
                <ChipButton
                  label="RETRY"
                  icon="refresh"
                  active
                  onPress={retryTranslation}
                />
                <ChipButton
                  label="CHANGE OCR LANGUAGE"
                  icon="language-outline"
                  disabled={languageBusy}
                  onPress={() => setOverlay({ kind: 'languagePicker' })}
                />
              </View>
            ) : record.status === 'failed' ? (
              <View style={styles.statePanel}>
                <MicroLabel tone="danger">OCR FAILED</MicroLabel>
                <Text style={styles.stateText}>
                  {record.error || 'The text could not be read.'}
                </Text>
                <ChipButton
                  label="RETRY OCR"
                  icon="refresh"
                  active
                  disabled={languageBusy}
                  onPress={() => void retryCapture(record.id)}
                />
                <ChipButton
                  label="CHANGE OCR LANGUAGE"
                  icon="language-outline"
                  disabled={languageBusy}
                  onPress={() => setOverlay({ kind: 'languagePicker' })}
                />
              </View>
            ) : record.status === 'done' && !captureText ? (
              <View style={styles.statePanel}>
                <MicroLabel tone="dim">NO TEXT FOUND</MicroLabel>
                <Text style={styles.stateText}>
                  Tap the OCR language below if it misread the characters.
                </Text>
                <ChipButton
                  label={`OCR LANGUAGE · ${languageShortLabel(record.hint)}`}
                  icon="language-outline"
                  active
                  disabled={languageBusy}
                  onPress={() => setOverlay({ kind: 'languagePicker' })}
                />
                {languageBusy ? (
                  <MicroLabel tone="accent">UPDATING OCR…</MicroLabel>
                ) : null}
              </View>
            ) : (
              <View style={styles.statePanel}>
                <ActivityIndicator color={colors.accent} />
                <MicroLabel tone="accent">
                  {pending ? 'READING CAPTURE…' : 'TRANSLATING…'}
                </MicroLabel>
              </View>
            )}
          </View>
        )}

        {waiting && result ? (
          <View style={styles.busy} pointerEvents="none">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
      </ScreenShell>

      <AppSheet visible={overlay !== null} onClose={() => setOverlay(null)}>
        {overlay?.kind === 'lookup' ? (
          <LookupSheet
            q={overlay.q}
            alt={overlay.alt}
            onClose={() => setOverlay(null)}
          />
        ) : overlay?.kind === 'languages' ? (
          <LanguagesSheet onClose={() => setOverlay(null)} />
        ) : overlay?.kind === 'languagePicker' && record ? (
          <LanguagePickerSheet
            title="OCR LANGUAGE"
            selected={record.hint || 'auto'}
            allowAuto
            onSelect={(code) => {
              chooseLanguage(code);
            }}
          />
        ) : null}
      </AppSheet>
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: 28,
  },
  statePanel: {
    gap: spacing.sm,
    alignItems: 'center',
    maxWidth: 420,
  },
  stateText: {
    ...typography.body,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  busy: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
