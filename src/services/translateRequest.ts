import { languageLabel } from '../constants/languages';

export type TranslateStatus = 'idle' | 'loading' | 'done' | 'error';

export interface TranslateRequestState {
  status: TranslateStatus;
  requestId: number;
  text: string | null;
  error: string | null;
  packGap: boolean;
}

export type TranslateAction =
  | { type: 'start'; requestId: number }
  | { type: 'success'; requestId: number; text: string }
  | { type: 'failure'; requestId: number; message: string; packGap: boolean }
  | { type: 'reset' };

export const IDLE_TRANSLATE: TranslateRequestState = {
  status: 'idle',
  requestId: 0,
  text: null,
  error: null,
  packGap: false,
};

/**
 * A result is only accepted while the request that produced it is still the
 * newest one, so a slow translation cannot overwrite a newer pair or edit.
 */
export function translateReducer(
  state: TranslateRequestState,
  action: TranslateAction,
): TranslateRequestState {
  switch (action.type) {
    case 'start':
      return {
        ...state,
        status: 'loading',
        requestId: action.requestId,
        error: null,
        packGap: false,
      };
    case 'success':
      if (action.requestId !== state.requestId || state.status !== 'loading') {
        return state;
      }
      return { ...state, status: 'done', text: action.text, error: null };
    case 'failure':
      if (action.requestId !== state.requestId || state.status !== 'loading') {
        return state;
      }
      return {
        ...state,
        status: 'error',
        text: null,
        error: action.message,
        packGap: action.packGap,
      };
    case 'reset':
      return IDLE_TRANSLATE;
  }
}

export function swapPair(
  source: string,
  target: string,
): { source: string; target: string } {
  return { source: target, target: source };
}

export interface TranslateFailure {
  message: string;
  packGap: boolean;
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}

export function describeTranslateFailure(
  error: unknown,
  source: string,
  target: string,
): TranslateFailure {
  const pair = `${languageLabel(source)} → ${languageLabel(target)}`;
  switch (errorCode(error)) {
    case 'ERR_LANGUAGE_PACK_MISSING':
      return {
        message: `The ${pair} offline pack is not installed.`,
        packGap: true,
      };
    case 'ERR_LANGUAGE_UNSUPPORTED':
      return {
        message: `${pair} is not supported on this device.`,
        packGap: false,
      };
    case 'ERR_NO_PRESENTATION_CONTEXT':
      return {
        message: 'The language pack installer could not open. Try again.',
        packGap: true,
      };
    default:
      return { message: 'Translation failed. Try again.', packGap: false };
  }
}
