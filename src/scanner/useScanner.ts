import * as Brightness from 'expo-brightness';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';

import vision from '../../modules/native-vision-translator';
import {
  clearOriginalBrightness,
  readOriginalBrightness,
  writeOriginalBrightness,
} from '@/services/brightness';
import { localDayKey } from '@/services/day';
import { entitlements } from '@/services/entitlements';
import { startMotionSampler, type MotionSampler } from '@/services/motion';
import { describeNativeError } from '@/services/nativeErrors';
import { readScanCount, writeScanCount } from '@/services/scanLedger';
import {
  readCachedTranslation,
  writeCachedTranslation,
} from '@/services/translationCache';
import type { ScannerEffect } from './machine';
import { ScannerStore, type ScannerSnapshot } from './store';

const DIM_BRIGHTNESS = 0.03;
const CAPTURE_TIMEOUT_MS = 12_000;

export interface ScannerController {
  snapshot: ScannerSnapshot;
  motionAvailable: boolean;
  wake: () => void;
  scanAgain: () => void;
  dismissError: () => void;
}

export function useScanner(): ScannerController {
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
    });
  }
  const store = storeRef.current;

  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  const [motionAvailable, setMotionAvailable] = useState(true);
  const focusedRef = useRef(false);
  const savedBrightnessRef = useRef<number | null>(null);
  const brightnessQueueRef = useRef<Promise<void>>(Promise.resolve());

  useKeepAwake();

  const dimScreen = useCallback((): Promise<void> => {
    brightnessQueueRef.current = brightnessQueueRef.current.then(async () => {
      try {
        if (savedBrightnessRef.current === null) {
          // Recover the user's brightness if the app was force-quit while
          // asleep; otherwise remember the current value before dimming.
          const persisted = await readOriginalBrightness().catch(() => null);
          if (persisted !== null) {
            savedBrightnessRef.current = persisted;
          } else {
            const current = await Brightness.getBrightnessAsync();
            savedBrightnessRef.current = current;
            if (current > DIM_BRIGHTNESS) {
              void writeOriginalBrightness(current).catch(() => {});
            }
          }
        }
        await Brightness.setBrightnessAsync(DIM_BRIGHTNESS);
      } catch {
        // Brightness is a nice-to-have; scanning must keep working.
      }
    });
    return brightnessQueueRef.current;
  }, []);

  const restoreBrightness = useCallback((): Promise<void> => {
    brightnessQueueRef.current = brightnessQueueRef.current.then(async () => {
      try {
        if (savedBrightnessRef.current === null) {
          savedBrightnessRef.current = await readOriginalBrightness().catch(
            () => null,
          );
        }
        if (savedBrightnessRef.current !== null) {
          await Brightness.setBrightnessAsync(savedBrightnessRef.current);
          savedBrightnessRef.current = null;
          await clearOriginalBrightness().catch(() => {});
        }
      } catch {
        savedBrightnessRef.current = null;
      }
    });
    return brightnessQueueRef.current;
  }, []);

  // Leaving the scanner (paywall, pack sheet, incoming call) must never leave
  // the camera armed in the background.
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (storeRef.current?.getSnapshot().state === 'SLEEP') {
        void dimScreen();
      }

      return () => {
        focusedRef.current = false;
        const state = storeRef.current?.getSnapshot().state;
        if (state !== undefined && state !== 'LOCKED_READ') {
          storeRef.current?.send({
            type: 'SLEEP',
            timestampMs: Date.now(),
          });
        }
        void restoreBrightness();
      };
    }, [dimScreen, restoreBrightness]),
  );

  useEffect(() => {
    let disposed = false;
    let capturing = false;
    let captureToken = 0;
    let pollingStatus = false;
    let sampler: MotionSampler | null = null;
    let statusTimer: ReturnType<typeof setInterval> | null = null;
    let currentDay = localDayKey();

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
              message: 'The scan timed out. Hold steady and try again.',
              fatal: false,
            },
            timestampMs: Date.now(),
          });
        }
      }, CAPTURE_TIMEOUT_MS);

      try {
        const ocr = await vision.captureFrame();
        if (token !== captureToken) {
          return;
        }
        language = ocr.sourceLanguage || undefined;

        if (ocr.text.trim().length === 0) {
          store.send({
            type: 'CAPTURE_FAILED',
            error: {
              code: 'no_text',
              message: 'No readable text. Fill the frame with the sign.',
              fatal: false,
            },
            timestampMs: Date.now(),
          });
          return;
        }

        const cachedText = await readCachedTranslation(ocr.sourceHash).catch(
          () => null,
        );
        if (token !== captureToken) {
          return;
        }

        let translatedText = cachedText;
        let cached = cachedText !== null;

        if (translatedText === null) {
          const translation = await vision.translate({
            text: ocr.text,
            sourceLanguage: ocr.sourceLanguage,
          });
          if (token !== captureToken) {
            return;
          }
          translatedText = translation.translatedText;
          cached = false;
          void writeCachedTranslation({
            sourceHash: ocr.sourceHash,
            sourceText: ocr.text,
            sourceLanguage: ocr.sourceLanguage,
            targetText: translatedText,
          }).catch(() => {});
        }

        if (
          token !== captureToken ||
          store.getSnapshot().state !== 'SCANNING'
        ) {
          return;
        }

        store.send({
          type: 'CAPTURE_SUCCEEDED',
          result: {
            sourceText: ocr.text,
            translatedText,
            sourceLanguage: ocr.sourceLanguage,
            sourceHash: ocr.sourceHash,
            blocks: ocr.blocks,
            imageWidth: ocr.imageWidth,
            imageHeight: ocr.imageHeight,
            cached,
            ...(ocr.previewJpegBase64
              ? { previewJpegBase64: ocr.previewJpegBase64 }
              : {}),
          },
          timestampMs: Date.now(),
        });
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
          void vision
            .startCamera()
            .then(() => {
              // The permission prompt can outlive the arm (the reducer times
              // out after 4 s). Never leave a session running after SLEEP.
              if (store.getSnapshot().state !== 'PREWARM') {
                void vision.stopCamera().catch(() => {});
              }
            })
            .catch((error: unknown) => {
              if (store.getSnapshot().state === 'PREWARM') {
                store.send({
                  type: 'CAMERA_FAILED',
                  error: describeNativeError(error),
                  timestampMs: Date.now(),
                });
              }
            });
          break;
        case 'STOP_CAMERA':
          void vision.stopCamera().catch(() => {});
          break;
        case 'CAPTURE_FRAME':
          void captureOnce();
          break;
        case 'DIM_SCREEN':
          void dimScreen();
          break;
        case 'RESTORE_BRIGHTNESS':
          void restoreBrightness();
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

    const unsubscribeStatePoller = store.subscribe(() => {
      if (store.getSnapshot().state === 'PREWARM') {
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
    });

    void (async () => {
      try {
        await entitlements.hydrate();
        const used = await readScanCount(currentDay);
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

    void startMotionSampler((sample) => {
      if (!disposed && focusedRef.current) {
        store.send({ type: 'MOTION', sample });
      }
    })
      .then((result) => {
        if (disposed) {
          result?.stop();
          return;
        }
        sampler = result;
        setMotionAvailable(result !== null);
      })
      .catch(() => {
        if (!disposed) {
          setMotionAvailable(false);
        }
      });

    const tickTimer = setInterval(() => {
      store.send({ type: 'TICK', timestampMs: Date.now() });
    }, 250);

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
      if (next !== 'active') {
        store.send({ type: 'SLEEP', timestampMs: Date.now() });
        void restoreBrightness();
      } else if (store.getSnapshot().state === 'SLEEP') {
        void dimScreen();
      }
    });

    return () => {
      disposed = true;
      store.setEffectHandler(null);
      unsubscribeEntitlements();
      unsubscribeStatePoller();
      appStateSubscription.remove();
      clearInterval(tickTimer);
      clearInterval(dayTimer);
      clearInterval(statusTimer);
      sampler?.stop();
      void restoreBrightness();
      void vision.stopCamera().catch(() => {});
    };
  }, [dimScreen, restoreBrightness, store]);

  const wake = useCallback(() => {
    store.send({ type: 'WAKE', timestampMs: Date.now() });
  }, [store]);

  const scanAgain = useCallback(() => {
    store.send({ type: 'SCAN_AGAIN', timestampMs: Date.now() });
  }, [store]);

  const dismissError = useCallback(() => {
    store.send({ type: 'DISMISS_ERROR', timestampMs: Date.now() });
  }, [store]);

  return { snapshot, motionAvailable, wake, scanAgain, dismissError };
}
