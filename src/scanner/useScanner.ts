import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';

import vision, { type OcrCrop } from '../../modules/native-vision-translator';
import { isEnglishLanguageCode } from '@/constants/languages';
import { localDayKey } from '@/services/day';
import { entitlements } from '@/services/entitlements';
import {
  describeNativeError,
  isLanguagePackFailure,
} from '@/services/nativeErrors';
import { readScanCount, writeScanCount } from '@/services/scanLedger';
import { sourceLanguage } from '@/services/sourceLanguage';
import {
  readCachedTranslation,
  writeCachedTranslation,
} from '@/services/translationCache';
import type { ScannerEffect } from './machine';
import { ScannerStore, type ScannerSnapshot } from './store';

const CAPTURE_TIMEOUT_MS = 12_000;

export interface ScannerController {
  snapshot: ScannerSnapshot;
  beginHold: () => void;
  setReticleFrame: (crop: OcrCrop | null) => void;
  scanAgain: () => void;
  captureNow: () => void;
  stop: () => void;
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

  const focusedRef = useRef(false);
  const reticleCropRef = useRef<OcrCrop | null>(null);

  useKeepAwake();

  // Leaving the scanner (paywall, pack sheet, incoming call) must never leave
  // the camera armed in the background. A frozen result is not interrupted.
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;

      return () => {
        focusedRef.current = false;
        const state = storeRef.current?.getSnapshot().state;
        if (state !== undefined && state !== 'LOCKED_READ') {
          storeRef.current?.send({
            type: 'SLEEP',
            timestampMs: Date.now(),
          });
        }
      };
    }, []),
  );

  useEffect(() => {
    let disposed = false;
    let capturing = false;
    let captureToken = 0;
    let pollingStatus = false;
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
        const selectedLanguage = sourceLanguage.current();
        const crop =
          reticleCropRef.current ?? {
            x: 0.2,
            y: 0.2,
            width: 0.6,
            height: 0.6,
          };
        const ocr = await vision.captureFrame(
          selectedLanguage === 'auto' ? '' : selectedLanguage,
          crop,
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
              message: 'No readable text. Fill the frame with the sign.',
              fatal: false,
            },
            timestampMs: Date.now(),
          });
          return;
        }

        const base = {
          sourceText: ocr.text,
          sourceLanguage: language,
          sourceHash: ocr.sourceHash,
          blocks: ocr.blocks,
          imageWidth: ocr.imageWidth,
          imageHeight: ocr.imageHeight,
          ...(ocr.previewJpegBase64
            ? { previewJpegBase64: ocr.previewJpegBase64 }
            : {}),
        };

        const sendResult = (
          kind: 'translated' | 'english' | 'pack_missing',
          translatedText: string,
          cached: boolean,
        ) => {
          if (
            token !== captureToken ||
            store.getSnapshot().state !== 'SCANNING'
          ) {
            return;
          }
          store.send({
            type: 'CAPTURE_SUCCEEDED',
            result: { ...base, kind, translatedText, cached },
            timestampMs: Date.now(),
          });
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

        const cachedText = await readCachedTranslation(ocr.sourceHash).catch(
          () => null,
        );
        if (token !== captureToken) {
          return;
        }

        if (cachedText !== null) {
          sendResult('translated', cachedText, true);
          return;
        }

        try {
          const translation = await vision.translate({
            text: ocr.text,
            sourceLanguage: language,
          });
          if (token !== captureToken) {
            return;
          }
          void writeCachedTranslation({
            sourceHash: ocr.sourceHash,
            sourceText: ocr.text,
            sourceLanguage: language,
            targetText: translation.translatedText,
          }).catch(() => {});
          sendResult('translated', translation.translatedText, false);
        } catch (error) {
          if (token !== captureToken) {
            return;
          }
          if (isLanguagePackFailure(error)) {
            // Still surface the source text and a download prompt; this is a
            // notice, not a fatal scan failure, and it does not use a scan.
            sendResult('pack_missing', '', false);
            return;
          }
          throw error;
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
        await Promise.all([
          entitlements.hydrate(),
          sourceLanguage.hydrate(),
        ]);
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
      void vision.stopCamera().catch(() => {});
    };
  }, [store]);

  const setReticleFrame = useCallback((crop: OcrCrop | null) => {
    reticleCropRef.current = crop;
  }, []);

  const beginHold = useCallback(() => {
    if (store.getSnapshot().state === 'SLEEP') {
      store.send({ type: 'WAKE', timestampMs: Date.now() });
    }
  }, [store]);

  const scanAgain = useCallback(() => {
    store.send({ type: 'SCAN_AGAIN', timestampMs: Date.now() });
  }, [store]);

  const captureNow = useCallback(() => {
    store.send({ type: 'CAPTURE_NOW', timestampMs: Date.now() });
  }, [store]);

  const stop = useCallback(() => {
    store.send({ type: 'STOP', timestampMs: Date.now() });
  }, [store]);

  const dismissError = useCallback(() => {
    store.send({ type: 'DISMISS_ERROR', timestampMs: Date.now() });
  }, [store]);

  return {
    snapshot,
    beginHold,
    setReticleFrame,
    scanAgain,
    captureNow,
    stop,
    dismissError,
  };
}
