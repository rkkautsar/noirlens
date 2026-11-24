import vision from '../../modules/native-vision-translator';
import { languageLabel } from '../constants/languages';
import {
  describeNativeError,
  isLanguagePackFailure,
  isUnsupportedLanguagePair,
} from './nativeErrors';

export type TranslationOutcome =
  | { status: 'translated'; text: string; cached: boolean }
  | { status: 'pack_missing'; message: string }
  | { status: 'unsupported'; message: string }
  | { status: 'failed'; message: string };

const RESULT_CACHE_LIMIT = 64;
const translationCache = new Map<string, string>();
const inFlight = new Map<string, Promise<TranslationOutcome>>();

function cacheKey(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): string {
  return `${targetLanguage}\u0000${sourceLanguage}\u0000${text}`;
}

/** One translation boundary with a bounded success cache and in-flight dedupe. */
export async function translateText(args: {
  text: string;
  sourceLanguage: string;
  targetLanguage?: string;
}): Promise<TranslationOutcome> {
  const targetLanguage = args.targetLanguage ?? 'en';
  const key = cacheKey(args.text, args.sourceLanguage, targetLanguage);
  const cached = translationCache.get(key);
  if (cached !== undefined) {
    return { status: 'translated', text: cached, cached: true };
  }
  const pending = inFlight.get(key);
  if (pending !== undefined) {
    return pending;
  }
  const task = runTranslation(args).then((outcome) => {
    if (outcome.status === 'translated') {
      translationCache.set(key, outcome.text);
      if (translationCache.size > RESULT_CACHE_LIMIT) {
        const oldest = translationCache.keys().next().value;
        if (oldest !== undefined) {
          translationCache.delete(oldest);
        }
      }
    }
    return outcome;
  });
  inFlight.set(key, task);
  void task.finally(() => {
    inFlight.delete(key);
  });
  return task;
}

/**
 * Screens and the scanner use this instead of calling the native module
 * directly, so pack, unsupported-pair and generic failures are classified the
 * same way everywhere.
 */
async function runTranslation({
  text,
  sourceLanguage,
  targetLanguage = 'en',
}: {
  text: string;
  sourceLanguage: string;
  targetLanguage?: string;
}): Promise<TranslationOutcome> {
  try {
    const payload = await vision.translate({
      text,
      sourceLanguage,
      targetLanguage,
    });
    return {
      status: 'translated',
      text: payload.translatedText,
      cached: payload.cached ?? false,
    };
  } catch (error) {
    const message = describeNativeError(error, sourceLanguage).message;
    if (isUnsupportedLanguagePair(error)) {
      return {
        status: 'unsupported',
        message: `${languageLabel(sourceLanguage)} to ${languageLabel(targetLanguage)} is not supported on this device.`,
      };
    }
    if (isLanguagePackFailure(error)) {
      // The bridge can report a pack error even when the pack is installed.
      // Trust the availability check and retry once before asking to download.
      const availability = await vision
        .checkLanguagePackStatus(sourceLanguage, targetLanguage)
        .catch(() => null);
      if (availability?.status === 'installed') {
        try {
          const retry = await vision.translate({
            text,
            sourceLanguage,
            targetLanguage,
          });
          return {
            status: 'translated',
            text: retry.translatedText,
            cached: retry.cached ?? false,
          };
        } catch (retryError) {
          if (isUnsupportedLanguagePair(retryError)) {
            return {
              status: 'unsupported',
              message: `${languageLabel(sourceLanguage)} to ${languageLabel(targetLanguage)} is not supported on this device.`,
            };
          }
          if (isLanguagePackFailure(retryError)) {
            return {
              status: 'failed',
              message: `The ${languageLabel(sourceLanguage)} pack is installed, but this text could not be translated.`,
            };
          }
          return {
            status: 'failed',
            message: describeNativeError(retryError, sourceLanguage).message,
          };
        }
      }
      return { status: 'pack_missing', message };
    }
    return { status: 'failed', message };
  }
}

export type PackOutcome = 'installed' | 'not_installed' | 'failed';

export async function installPack(
  sourceLanguage: string,
  targetLanguage = 'en',
): Promise<PackOutcome> {
  try {
    const status = await vision.prepareLanguagePack(
      sourceLanguage,
      targetLanguage,
    );
    return status.status === 'installed' ? 'installed' : 'not_installed';
  } catch {
    return 'failed';
  }
}
