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
        message: 'Camera access is off. Enable it in Settings to scan.',
        fatal: true,
      };
    case 'ERR_CAMERA_UNAVAILABLE':
      return {
        code: 'camera_unavailable',
        message: 'The camera is unavailable on this device.',
        fatal: true,
      };
    case 'ERR_NO_FRAME':
      return {
        code: 'capture_failed',
        message: 'No frame arrived. Hold steady and try again.',
        fatal: false,
      };
    case 'ERR_OCR_FAILED':
      return {
        code: 'no_text',
        message: 'Text recognition failed. Reframe the sign and try again.',
        fatal: true,
      };
    case 'ERR_LANGUAGE_PACK_MISSING':
      return {
        code: 'language_pack_missing',
        message: `Download the ${languageLabel} offline pack to translate.`,
        ...(language ? { language } : {}),
        fatal: true,
      };
    case 'ERR_LANGUAGE_UNSUPPORTED':
      return {
        code: 'language_pack_missing',
        message: `On-device translation from ${languageLabel} is not supported.`,
        ...(language ? { language } : {}),
        fatal: true,
      };
    case 'ERR_TRANSLATION_FAILED':
      return {
        code: 'translation_failed',
        message: 'On-device translation failed. Hold steady and try again.',
        fatal: true,
      };
    default:
      return {
        code: 'capture_failed',
        message: nativeMessage ?? 'The scan failed. Try again.',
        fatal: false,
      };
  }
}

export function isLanguagePackFailure(error: unknown): boolean {
  const code = readString(error, 'code');
  return (
    code === 'ERR_LANGUAGE_PACK_MISSING' ||
    code === 'ERR_LANGUAGE_UNSUPPORTED'
  );
}
