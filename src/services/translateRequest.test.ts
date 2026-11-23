import { describe, expect, it } from 'vitest';

import {
  IDLE_TRANSLATE,
  describeTranslateFailure,
  swapPair,
  translateReducer,
} from './translateRequest';

describe('swapPair', () => {
  it('exchanges source and target', () => {
    expect(swapPair('en', 'ja')).toEqual({ source: 'ja', target: 'en' });
  });
});

describe('translateReducer', () => {
  it('accepts the newest successful request', () => {
    const loading = translateReducer(IDLE_TRANSLATE, {
      type: 'start',
      requestId: 1,
    });
    const done = translateReducer(loading, {
      type: 'success',
      requestId: 1,
      text: 'こんにちは',
    });
    expect(done.status).toBe('done');
    expect(done.text).toBe('こんにちは');
  });

  it('ignores a stale result after a newer request starts', () => {
    let state = translateReducer(IDLE_TRANSLATE, {
      type: 'start',
      requestId: 1,
    });
    state = translateReducer(state, { type: 'start', requestId: 2 });
    const stale = translateReducer(state, {
      type: 'success',
      requestId: 1,
      text: 'old',
    });
    expect(stale.status).toBe('loading');
    expect(stale.text).toBeNull();
  });

  it('ignores a stale failure', () => {
    let state = translateReducer(IDLE_TRANSLATE, {
      type: 'start',
      requestId: 3,
    });
    state = translateReducer(state, {
      type: 'failure',
      requestId: 2,
      message: 'old',
      packGap: true,
    });
    expect(state.status).toBe('loading');
    expect(state.error).toBeNull();
  });

  it('records a missing pack and clears the previous result', () => {
    let state = translateReducer(IDLE_TRANSLATE, {
      type: 'success',
      requestId: 1,
      text: 'cached',
    });
    state = translateReducer(state, { type: 'start', requestId: 2 });
    state = translateReducer(state, {
      type: 'failure',
      requestId: 2,
      message: 'pack missing',
      packGap: true,
    });
    expect(state.status).toBe('error');
    expect(state.packGap).toBe(true);
    expect(state.text).toBeNull();
  });

  it('resets to idle', () => {
    const state = translateReducer(
      { status: 'done', requestId: 4, text: 'hi', error: null, packGap: false },
      { type: 'reset' },
    );
    expect(state).toEqual(IDLE_TRANSLATE);
  });
});

describe('describeTranslateFailure', () => {
  it('flags a missing offline pack', () => {
    const failure = describeTranslateFailure(
      { code: 'ERR_LANGUAGE_PACK_MISSING' },
      'ja',
      'en',
    );
    expect(failure.packGap).toBe(true);
    expect(failure.message).toContain('JAPANESE');
  });

  it('does not retry an unsupported pair', () => {
    const failure = describeTranslateFailure(
      { code: 'ERR_LANGUAGE_UNSUPPORTED' },
      'ja',
      'th',
    );
    expect(failure.packGap).toBe(false);
    expect(failure.message).toContain('not supported');
  });
});
