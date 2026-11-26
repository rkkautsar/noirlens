import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import vision, { type OcrCrop } from '../../modules/native-vision-translator';
import { translateText } from '../services/translationTask';

/** OCR rows arrive newline-separated; the translator sometimes doubles them. */
function normalizeTranslated(text: string): string {
  return text
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
import {
  isEnglishLanguageCode,
  TRAVELER_LANGUAGES,
} from '@/constants/languages';
import { localDayKey } from '@/services/day';
import { entitlements } from '@/services/entitlements';
import {
  describeNativeError,
  isCameraCancellation,
  isLanguagePackFailure,
} from '@/services/nativeErrors';
import { readScanCount, writeScanCount } from '@/services/scanLedger';
import { addScanHistory } from '@/services/scanHistory';
import { captureMode } from '@/services/captureMode';
import type { CaptureRecord } from '@/services/captureModel';
import { captures } from '@/services/captures';
import {
  enqueueCapture,
} from '@/services/captureProcessing';
import { sourceLanguage } from '@/services/sourceLanguage';
import type { CaptureMode, ScannerEffect } from './machine';
import { ScannerStore, type ScannerSnapshot } from './store';

const CAPTURE_TIMEOUT_MS = 12_000;

export interface ScannerController {
  snapshot: ScannerSnapshot;
  setCaptureMode: (mode: CaptureMode) => void;
  beginHold: () => void;
  setReticleFrame: (crop: OcrCrop | null) => void;
  scanAgain: () => void;
  captureNow: () => void;
  stop: () => void;
  dismissError: () => void;
  setActive: (active: boolean) => void;
  rescan: (language: string) => Promise<void>;
}

/** One scanner store for the whole app; camera and result read the same state. */
export function ScannerProvider({ children }: { children: ReactNode }) {
  const onCaptureSavedRef = useRef<
    ((record: CaptureRecord) => void) | undefined
  >(undefined);
  const controller = useScannerController(onCaptureSavedRef);
  const registerCaptureSaved = useCallback(
    (callback?: (record: CaptureRecord) => void) => {
      onCaptureSavedRef.current = callback;
      return () => {
        if (onCaptureSavedRef.current === callback) {
          onCaptureSavedRef.current = undefined;
        }
      };
    },
    [],
  );
  const value = useMemo(
    () => ({ ...controller, registerCaptureSaved }),
    [controller, registerCaptureSaved],
  );
  return (
    <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>
  );
}

type ScannerContextValue = ScannerController & {
  registerCaptureSaved: (
    callback?: (record: CaptureRecord) => void,
  ) => () => void;
};

const ScannerContext = createContext<ScannerContextValue | null>(null);

export function useScanner(options: {
  onCaptureSaved?: (record: CaptureRecord) => void;
} = {}): ScannerController {
  const value = useContext(ScannerContext);
  if (!value) {
    throw new Error('useScanner must be used inside ScannerProvider');
  }
  const { registerCaptureSaved, ...controller } = value;
  const callback = options.onCaptureSaved;
  useEffect(
    () => (callback ? registerCaptureSaved(callback) : undefined),
    [callback, registerCaptureSaved],
  );
  return controller;
}

function useScannerController(
  onCaptureSavedRef: MutableRefObject<
    ((record: CaptureRecord) => void) | undefined
  >,
): ScannerController {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const storeRef = useRef<ScannerStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = new ScannerStore({
      dayKey: localDayKey(),
      scansUsedToday: 0,
      unlimited: false,
      nowMs: Date.now(),
      captureMode: captureMode.current(),
    });
  }
  const store = storeRef.current;

  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  const focusedRef = useRef(false);
  const reticleCropRef = useRef<OcrCrop | null>(null);
  const rescanToken = useRef(0);

  useEffect(() => {
    void captureMode.hydrate();
    return captureMode.subscribe(() => {
      store.send({
        type: 'SET_CAPTURE_MODE',
        mode: captureMode.current(),
        timestampMs: Date.now(),
      });
    });
  }, [store]);

  useEffect(() => {
    let disposed = false;
    let capturing = false;
    let captureToken = 0;
    let captureWatchdog: ReturnType<typeof setTimeout> | null = null;
    let pollingStatus = false;
    let statusTimer: ReturnType<typeof setInterval> | null = null;
    let currentDay = localDayKey();
    let cameraStart: Promise<number> | null = null;

    const waitForCamera = async (): Promise<number | null> => {
      const promise = cameraStart;
      if (!promise) {
        return null;
      }
      try {
        return await promise;
      } catch {
        return null;
      }
    };

    const captureOnce = async () => {
      if (capturing || disposed || !focusedRef.current) {
        return;
      }
      capturing = true;
      const token = ++captureToken;
      let language: string | undefined;

      const watchdog = setTimeout(() => {
        if (token !== captureToken) {
          return;
        }
        captureToken += 1;
        capturing = false;
        if (store.getSnapshot().state === 'SCANNING') {
          store.send({
            type: 'CAPTURE_FAILED',
            error: {
              code: 'capture_failed',
              message: 'Scan timed out. Hold steady.',
              fatal: false,
            },
            timestampMs: Date.now(),
          });
        }
      }, CAPTURE_TIMEOUT_MS);
      captureWatchdog = watchdog;

      try {
        const selectedLanguage = sourceLanguage.current();
        const crop =
          reticleCropRef.current ?? {
            x: 0.2,
            y: 0.2,
            width: 0.6,
            height: 0.6,
          };
        const cameraToken = await waitForCamera();
        if (cameraToken === null) {
          throw { code: 'ERR_CAMERA_CANCELLED', message: 'Camera did not start.' };
        }
        const ocr = await vision.captureFrame(
          selectedLanguage === 'auto' ? '' : selectedLanguage,
          crop,
          cameraToken,
        );
        if (token !== captureToken) {
          return;
        }

        language =
          ocr.sourceLanguage ||
          (selectedLanguage === 'auto' ? 'und' : selectedLanguage);

        if (ocr.text.trim().length === 0) {
          store.send({
            type: 'CAPTURE_FAILED',
            error: {
              code: 'no_text',
              message: 'No text found.',
              fatal: true,
            },
            timestampMs: Date.now(),
          });
          return;
        }

        const base = {
          sourceText: ocr.text,
          sourceLanguage: language ?? 'und',
          sourceHash: ocr.sourceHash,
          blocks: ocr.blocks,
          imageWidth: ocr.imageWidth,
          imageHeight: ocr.imageHeight,
          ...(ocr.previewJpegBase64
            ? { previewJpegBase64: ocr.previewJpegBase64 }
            : {}),
          ...(ocr.previewUri ? { previewUri: ocr.previewUri } : {}),
        };

        const sendResult = (
          kind: 'translated' | 'english' | 'pack_missing',
          translatedText: string,
          cached: boolean,
          sourceLanguage: string = language ?? 'und',
        ) => {
          if (
            token !== captureToken ||
            store.getSnapshot().state !== 'SCANNING'
          ) {
            return;
          }
          store.send({
            type: 'CAPTURE_SUCCEEDED',
            result: { ...base, sourceLanguage, kind, translatedText, cached },
            timestampMs: Date.now(),
          });
          if (kind !== 'pack_missing') {
            void addScanHistory({
              sourceLanguage,
              sourceText: base.sourceText,
              translatedText,
              kind: kind === 'english' ? 'english' : 'translated',
            }).catch(() => {});
          }
        };

        // AUTO must never claim English as the source language. Show the
        // detection and let the user aim at another sign or choose a language.
        if (
          selectedLanguage === 'auto' &&
          isEnglishLanguageCode(language)
        ) {
          sendResult('english', '', false);
          return;
        }

        // If AUTO's detected pack is missing and the OCR was unsure, try
        // already-installed source packs before prompting for a download.
        const sourceStatus = await vision
          .checkLanguagePackStatus(language ?? 'und')
          .catch(() => null);
        if (
          selectedLanguage === 'auto' &&
          sourceStatus?.status !== 'installed' &&
          ocr.confidence < 0.65
        ) {
          const statuses = await vision
            .checkLanguagePackStatuses(
              TRAVELER_LANGUAGES.map((option) => option.code),
            )
            .catch(() => []);
          const installed = statuses
            .filter((status) => status.status === 'installed')
            .map((status) => status.language);

          for (const candidate of installed) {
            if (token !== captureToken) {
              return;
            }
            const outcome = await translateText({
              text: ocr.text,
              sourceLanguage: candidate,
            });
            if (outcome.status === 'translated') {
              if (token !== captureToken) {
                return;
              }
              sendResult(
                'translated',
                normalizeTranslated(outcome.text),
                false,
                candidate,
              );
              return;
            }
            // Try the next installed source pack.
          }
        }

        {
          const outcome = await translateText({
            text: ocr.text,
            sourceLanguage: language,
          });
          if (token !== captureToken) {
            return;
          }
          if (outcome.status === 'translated') {
            sendResult(
              'translated',
              normalizeTranslated(outcome.text),
              false,
            );
          } else if (outcome.status === 'pack_missing') {
            // The native bridge can report a pack error even when the pack is
            // installed (for example, when the forced source does not match
            // the text). Trust the availability check over the error code.
            if (sourceStatus?.status === 'installed') {
              store.send({
                type: 'CAPTURE_FAILED',
                error: {
                  code: 'translation_failed',
                  message:
                    'This text could not be translated from the selected source. Try another sign.',
                  fatal: true,
                },
                timestampMs: Date.now(),
              });
              return;
            }
            // Still surface the source text and a download prompt; this is a
            // notice, not a fatal scan failure, and it does not use a scan.
            sendResult('pack_missing', '', false);
            return;
          } else {
            store.send({
              type: 'CAPTURE_FAILED',
              error: {
                code: 'translation_failed',
                message: outcome.message,
                fatal: true,
              },
              timestampMs: Date.now(),
            });
            return;
          }
        }
      } catch (error) {
        if (token !== captureToken) {
          return;
        }
        // A drop or app background during the frame wait is not a scan error.
        if (store.getSnapshot().state === 'SCANNING') {
          store.send({
            type: 'CAPTURE_FAILED',
            error: describeNativeError(error, language),
            timestampMs: Date.now(),
          });
        }
      } finally {
        clearTimeout(watchdog);
        if (token === captureToken) {
          capturing = false;
        }
      }
    };

    const captureToCollection = async () => {
      if (capturing || disposed || !focusedRef.current) {
        return;
      }
      capturing = true;
      const token = ++captureToken;
      const hint = sourceLanguage.current();

      const watchdog = setTimeout(() => {
        if (token !== captureToken) {
          return;
        }
        captureToken += 1;
        capturing = false;
        if (store.getSnapshot().state === 'SCANNING') {
          store.send({
            type: 'CAPTURE_FAILED',
            error: {
              code: 'capture_failed',
              message: 'Capture timed out. Hold steady.',
              fatal: true,
            },
            timestampMs: Date.now(),
          });
        }
      }, CAPTURE_TIMEOUT_MS);
      captureWatchdog = watchdog;

      let savedFiles: string[] | null = null;
      try {
        const cameraToken = await waitForCamera();
        if (cameraToken === null) {
          throw { code: 'ERR_CAMERA_CANCELLED', message: 'Camera did not start.' };
        }
        const still = await vision.captureStill(cameraToken);
        savedFiles = [still.image, still.thumb];
        if (token !== captureToken) {
          return;
        }
        const at = Date.now();
        const record: CaptureRecord = {
          id: `cap-${at}-${Math.random().toString(36).slice(2, 8)}`,
          at,
          image: still.image,
          thumb: still.thumb,
          width: still.width,
          height: still.height,
          status: 'pending',
          hint: hint === 'auto' ? '' : hint,
          language: '',
          text: '',
          blocks: [],
          confidence: 0,
          reviewedAt: null,
          error: null,
          attempts: 0,
          ocrRevision: 0,
        };
        // Persistence gates the animation and the badge; OCR runs after.
        await captures.add(record);
        savedFiles = null;
        enqueueCapture(record.id);
        if (token !== captureToken) {
          return;
        }
        onCaptureSavedRef.current?.(record);
        store.send({ type: 'CAPTURE_SAVED', timestampMs: Date.now() });
      } catch (error) {
        if (token !== captureToken) {
          return;
        }
        store.send({
          type: 'CAPTURE_FAILED',
          error: describeNativeError(error),
          timestampMs: Date.now(),
        });
      } finally {
        if (savedFiles) {
          void vision.deleteCaptureFiles(savedFiles).catch(() => {});
        }
        clearTimeout(watchdog);
      }
    };

    const pollCameraStatus = async () => {
      if (pollingStatus || disposed) {
        return;
      }
      pollingStatus = true;
      try {
        const status = await vision.getCameraStatus();
        store.send({
          type: 'CAMERA_SETTLED',
          settled: status.settled,
          timestampMs: Date.now(),
        });
      } catch {
        // The session may not be configured yet; the next poll retries.
      } finally {
        pollingStatus = false;
      }
    };

    const handleEffect = (effect: ScannerEffect) => {
      switch (effect.type) {
        case 'START_CAMERA':
          if (AppState.currentState !== 'active') {
            store.send({ type: 'SLEEP', timestampMs: Date.now() });
            break;
          }
          const start = vision.startCamera();
          cameraStart = start;
          void start
            .then((generation: number) => {
              // A newer hold owns the camera now; never stop its session on
              // behalf of a superseded start. But a start that raced a stop
              // may have minted its own session, so tear down exactly that
              // generation.
              if (cameraStart !== start) {
                void vision.stopCameraIfCurrent(generation).catch(() => {});
                return;
              }
              // The permission prompt can outlive the arm (the reducer times
              // out after 4 s). Never leave a session running after SLEEP,
              // but do not stop a session the capture phase is using: a fast
              // release moves PREWARM -> SCANNING before startup resolves.
              const current = store.getSnapshot().state;
              if (current !== 'PREWARM' && current !== 'SCANNING') {
                void vision.stopCamera().catch(() => {});
              }
            })
            .catch((error: unknown) => {
              // A rejected stale start must not sleep the hold that replaced
              // it.
              if (cameraStart !== start) {
                return;
              }
              if (store.getSnapshot().state !== 'PREWARM') {
                return;
              }
              if (isCameraCancellation(error)) {
                store.send({ type: 'SLEEP', timestampMs: Date.now() });
                return;
              }
              store.send({
                type: 'CAMERA_FAILED',
                error: describeNativeError(error),
                timestampMs: Date.now(),
              });
            });
          break;
        case 'STOP_CAMERA':
          captureToken += 1;
          capturing = false;
          cameraStart = null;
          if (captureWatchdog !== null) {
            clearTimeout(captureWatchdog);
            captureWatchdog = null;
          }
          void vision.stopCamera().catch(() => {});
          break;
        case 'CAPTURE_FRAME':
          if (effect.mode === 'collect') {
            void captureToCollection();
          } else {
            void captureOnce();
          }
          break;
        case 'PERSIST_SCAN':
          void writeScanCount(effect.dayKey, effect.scansUsedToday).catch(
            () => {},
          );
          break;
        case 'SHOW_PAYWALL':
          routerRef.current.push('/paywall');
          break;
        case 'HAPTIC_SUCCESS':
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
          break;
        case 'HAPTIC_ERROR':
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Warning,
          ).catch(() => {});
          break;
      }
    };

    store.setEffectHandler(handleEffect);

    const unsubscribeEntitlements = entitlements.subscribe(() => {
      store.send({
        type: 'ENTITLEMENT_CHANGED',
        unlimited: entitlements.isUnlimited(),
        timestampMs: Date.now(),
      });
    });

    let tickTimer: ReturnType<typeof setInterval> | null = null;
    const syncTimers = () => {
      const snapshot = store.getSnapshot();
      const needsStatus =
        snapshot.state === 'PREWARM' && snapshot.mode === 'AUTO';
      if (needsStatus) {
        if (statusTimer === null) {
          void pollCameraStatus();
          statusTimer = setInterval(() => {
            void pollCameraStatus();
          }, 100);
        }
      } else if (statusTimer !== null) {
        clearInterval(statusTimer);
        statusTimer = null;
      }
      const needsTick =
        snapshot.state === 'PREWARM' || snapshot.state === 'SCANNING';
      if (needsTick) {
        if (tickTimer === null) {
          tickTimer = setInterval(() => {
            store.send({ type: 'TICK', timestampMs: Date.now() });
          }, 250);
        }
      } else if (tickTimer !== null) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    };
    const unsubscribeStatePoller = store.subscribe(syncTimers);
    syncTimers();

    void (async () => {
      try {
        const [used] = await Promise.all([
          readScanCount(currentDay),
          entitlements.hydrate(),
          sourceLanguage.hydrate(),
        ]);
        if (disposed) {
          return;
        }
        store.send({
          type: 'HYDRATE',
          dayKey: currentDay,
          scansUsedToday: used,
          unlimited: entitlements.isUnlimited(),
          timestampMs: Date.now(),
        });
      } catch {
        if (!disposed) {
          store.send({
            type: 'HYDRATE',
            dayKey: currentDay,
            scansUsedToday: 0,
            unlimited: entitlements.isUnlimited(),
            timestampMs: Date.now(),
          });
        }
      }
    })();

    const dayTimer = setInterval(() => {
      const today = localDayKey();
      if (today !== currentDay) {
        currentDay = today;
        void readScanCount(today)
          .then((used) => {
            store.send({
              type: 'DAY_ROLLOVER',
              dayKey: today,
              scansUsedToday: used,
              timestampMs: Date.now(),
            });
          })
          .catch(() => {});
      }
      store.send({
        type: 'ENTITLEMENT_CHANGED',
        unlimited: entitlements.isUnlimited(),
        timestampMs: Date.now(),
      });
    }, 30_000);

    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (
        next !== 'active' &&
        store.getSnapshot().state !== 'LOCKED_READ'
      ) {
        store.send({ type: 'SLEEP', timestampMs: Date.now() });
      }
    });

    return () => {
      disposed = true;
      store.setEffectHandler(null);
      unsubscribeEntitlements();
      unsubscribeStatePoller();
      appStateSubscription.remove();
      if (tickTimer !== null) {
        clearInterval(tickTimer);
      }
      clearInterval(dayTimer);
      clearInterval(statusTimer);
      void vision.stopCamera().catch(() => {});
    };
  }, [store]);

  const setReticleFrame = useCallback((crop: OcrCrop | null) => {
    reticleCropRef.current = crop;
  }, []);

  const beginHold = useCallback(() => {
    if (AppState.currentState !== 'active') {
      return;
    }
    if (store.getSnapshot().state === 'SLEEP') {
      store.send({ type: 'WAKE', timestampMs: Date.now() });
    }
  }, [store]);

  const scanAgain = useCallback(() => {
    rescanToken.current += 1;
    store.send({ type: 'SCAN_AGAIN', timestampMs: Date.now() });
  }, [store]);

  const captureNow = useCallback(() => {
    store.send({ type: 'CAPTURE_NOW', timestampMs: Date.now() });
  }, [store]);

  const stop = useCallback(() => {
    rescanToken.current += 1;
    store.send({ type: 'STOP', timestampMs: Date.now() });
  }, [store]);

  const dismissError = useCallback(() => {
    store.send({ type: 'DISMISS_ERROR', timestampMs: Date.now() });
  }, [store]);

  const setCaptureMode = useCallback((mode: CaptureMode) => {
    void captureMode.set(mode);
  }, []);

  const setActive = useCallback(
    (active: boolean) => {
      focusedRef.current = active;
      if (!active) {
        rescanToken.current += 1;
      }
      if (active) {
        void activateKeepAwakeAsync().catch(() => {});
        return;
      }
      void deactivateKeepAwake().catch(() => {});
      // A frozen result stays available while covered by the result page.
      if (store.getSnapshot().state !== 'LOCKED_READ') {
        store.send({ type: 'SLEEP', timestampMs: Date.now() });
      }
    },
    [store],
  );

  const rescan = useCallback(
    async (language: string) => {
      const before = store.getSnapshot();
      if (before.state !== 'LOCKED_READ' || !before.result) {
        return;
      }
      const scanHash = before.result.sourceHash;
      const wasPackMissing = before.result.kind === 'pack_missing';
      const token = ++rescanToken.current;
      try {
        const hint = language === 'auto' ? '' : language;
        const ocr = await vision.recognizeLast(hint);
        // The result may have been replaced by another scan while OCR ran.
        const current = store.getSnapshot();
        if (
          token !== rescanToken.current ||
          current.state !== 'LOCKED_READ' ||
          current.result?.sourceHash !== scanHash
        ) {
          return;
        }
        const resolvedLanguage =
          ocr.sourceLanguage || (language === 'auto' ? 'und' : language);
        const base = {
          sourceText: ocr.text,
          sourceLanguage: resolvedLanguage,
          sourceHash: ocr.sourceHash,
          blocks: ocr.blocks,
          imageWidth: ocr.imageWidth,
          imageHeight: ocr.imageHeight,
          ...(ocr.previewJpegBase64
            ? { previewJpegBase64: ocr.previewJpegBase64 }
            : {}),
          ...(ocr.previewUri ? { previewUri: ocr.previewUri } : {}),
        };
        let translatedText = '';
        let kind: 'translated' | 'english' | 'pack_missing' = 'translated';
        let cached = false;
        if (isEnglishLanguageCode(resolvedLanguage)) {
          kind = 'english';
        } else {
          const outcome = await translateText({
            text: ocr.text,
            sourceLanguage: resolvedLanguage,
          });
          if (outcome.status === 'translated') {
            translatedText = normalizeTranslated(outcome.text);
            cached = outcome.cached;
          } else if (outcome.status === 'pack_missing') {
            kind = 'pack_missing';
          } else {
            // Unsupported pairs and generic failures keep the prior result;
            // they are not an English detection.
            return;
          }
        }
        const settled = store.getSnapshot();
        if (
          token !== rescanToken.current ||
          settled.state !== 'LOCKED_READ' ||
          settled.result?.sourceHash !== scanHash
        ) {
          return;
        }
        store.send({
          type: 'RESULT_REPLACED',
          result: { ...base, kind, translatedText, cached },
          count: wasPackMissing && kind === 'translated',
          timestampMs: Date.now(),
        });
        if (wasPackMissing && kind === 'translated') {
          void addScanHistory({
            sourceLanguage: resolvedLanguage,
            sourceText: ocr.text,
            translatedText,
            kind: 'translated',
          }).catch(() => {});
        }
      } catch {
        // The frozen frame is gone; keep the current result.
      }
    },
    [store],
  );

  return {
    snapshot,
    setCaptureMode,
    beginHold,
    setReticleFrame,
    scanAgain,
    captureNow,
    stop,
    dismissError,
    setActive,
    rescan,
  };
}
