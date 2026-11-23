import type { ScanError } from '@/scanner/machine';

function readString(error: unknown, key: 'code' | 'message'): string | null {
  if (typeof error !== 'object' || error === null || !(key in error)) {
    return null;
  }
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function describeNativeError(
  error: unknown,
  language?: string,
): ScanError {
  const code = readString(error, 'code');
  const nativeMessage = readString(error, 'message');
  const languageLabel = language ? language.toUpperCase() : 'this language';

  switch (code) {
    case 'ERR_CAMERA_PERMISSION_DENIED':
      return {
        code: 'permission_denied',
        message: 'Camera access is off. Enable it in Settings.',
        fatal: true,
      };
    case 'ERR_CAMERA_UNAVAILABLE':
      return {
        code: 'camera_unavailable',
        message: 'Camera unavailable.',
        fatal: true,
      };
    case 'ERR_NO_FRAME':
      return {
        code: 'capture_failed',
        message: 'No frame. Hold steady.',
        fatal: true,
      };
    case 'ERR_OCR_FAILED':
      return {
        code: 'no_text',
        message: 'Could not read text.',
        fatal: true,
      };
    case 'ERR_LANGUAGE_PACK_MISSING':
      return {
        code: 'language_pack_missing',
        message: `Download the ${languageLabel} pack.`,
        ...(language ? { language } : {}),
        fatal: true,
      };
    case 'ERR_LANGUAGE_UNSUPPORTED':
      return {
        code: 'language_pack_missing',
        message: `${languageLabel} is not supported.`,
        ...(language ? { language } : {}),
        fatal: true,
      };
    case 'ERR_TRANSLATION_FAILED':
      return {
        code: 'translation_failed',
        message: 'Translation failed.',
        fatal: true,
      };
    default:
      return {
        code: 'capture_failed',
        message: 'Scan failed.',
        fatal: true,
      };
  }
}

export function isCameraCancellation(error: unknown): boolean {
  const code = readString(error, 'code');
  return code === 'ERR_CAMERA_INACTIVE' || code === 'ERR_CAMERA_CANCELLED';
}

export function isLanguagePackFailure(error: unknown): boolean {
  const code = readString(error, 'code');
  return (
    code === 'ERR_LANGUAGE_PACK_MISSING' ||
    code === 'ERR_LANGUAGE_UNSUPPORTED'
  );
}

/** The pair itself is unsupported; installing a pack cannot help. */
export function isUnsupportedLanguagePair(error: unknown): boolean {
  return readString(error, 'code') === 'ERR_LANGUAGE_UNSUPPORTED';
}
