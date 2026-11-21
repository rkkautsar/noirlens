import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TUNING,
  createInitialContext,
  reduceScanner,
  remainingScans,
  type ScanResult,
  type ScannerContext,
  type ScannerEffect,
  type ScannerEvent,
  type ScannerTuning,
} from './machine';

const DAY = '2026-11-21';

const RESULT: ScanResult = {
  sourceText: '出口',
  translatedText: 'Exit',
  sourceLanguage: 'ja',
  sourceHash: 'abc123',
  blocks: [
    { text: '出口', confidence: 0.98, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
  ],
  imageWidth: 720,
  imageHeight: 1280,
  cached: false,
};

function ctx(overrides: Partial<ScannerContext> = {}): ScannerContext {
  return {
    ...createInitialContext({ dayKey: DAY, nowMs: 0 }),
    hydrated: true,
    ...overrides,
  };
}

function motion(
  timestampMs: number,
  pitchDeg: number,
  pitchRateDegSec = 0,
  angularSpeedRadSec = 0.02,
): ScannerEvent {
  return {
    type: 'MOTION',
    sample: { timestampMs, pitchDeg, pitchRateDegSec, angularSpeedRadSec },
  };
}

function run(
  context: ScannerContext,
  events: ScannerEvent[],
  tuning: ScannerTuning = DEFAULT_TUNING,
): { context: ScannerContext; effects: ScannerEffect[] } {
  let state = context;
  const effects: ScannerEffect[] = [];
  for (const event of events) {
    const result = reduceScanner(state, event, tuning);
    state = result.context;
    effects.push(...result.effects);
  }
  return { context: state, effects };
}

/** Lowered phone, then a fast raise into the arm band. */
function raised(timestampMs = 1000): ScannerContext {
  return run(ctx(), [
    motion(timestampMs - 100, 8, 0, 0.02),
    motion(timestampMs, 55, 180, 1.4),
  ]).context;
}

/** Arm, settle, hold still long enough to fire the shutter (t=1550). */
function scanning(timestampMs = 1550): ScannerContext {
  const armed = raised(1000);
  return run(
    armed,
    [
      { type: 'CAMERA_SETTLED', settled: true, timestampMs: 1100 },
      motion(1200, 55, 0, 0.05),
      { type: 'TICK', timestampMs },
    ],
  ).context;
}

function hasEffect(effects: ScannerEffect[], type: ScannerEffect['type']): boolean {
  return effects.some((effect) => effect.type === type);
}

describe('SLEEP arm gesture', () => {
  it('arms when a raise enters the pitch band with upward velocity', () => {
    const result = run(ctx(), [
      motion(1000, 8, 0, 0.02),
      motion(1100, 50, 120, 1.2),
    ]);

    expect(result.context.state).toBe('PREWARM');
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(true);
    expect(hasEffect(result.effects, 'RESTORE_BRIGHTNESS')).toBe(true);
  });

  it('ignores a jolt that starts inside the band', () => {
    const result = run(ctx({ pitchDeg: 60 }), [motion(1000, 60, 300, 1.0)]);
    expect(result.context.state).toBe('SLEEP');
    expect(result.effects).toEqual([]);
  });

  it('ignores a slow lift', () => {
    const result = run(ctx(), [
      motion(1000, 8, 0, 0.02),
      motion(1100, 50, 10, 0.3),
    ]);
    expect(result.context.state).toBe('SLEEP');
    expect(result.effects).toEqual([]);
  });

  it('ignores an entry after the outside-band window expires', () => {
    const result = run(ctx(), [
      motion(1000, 8, 0, 0.02),
      motion(2500, 50, 200, 1.2),
    ]);
    expect(result.context.state).toBe('SLEEP');
  });

  it('arms when tilting down from a vertical pocket into the band', () => {
    const result = run(ctx(), [
      motion(1000, 90, 0, 0.02),
      motion(1100, 60, -160, 1.2),
    ]);
    expect(result.context.state).toBe('PREWARM');
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(true);
  });

  it('arms manually from a flat phone', () => {
    const result = run(ctx({ pitchDeg: 0 }), [{ type: 'WAKE', timestampMs: 500 }]);
    expect(result.context.state).toBe('PREWARM');
    expect(result.context.armedAtMs).toBe(500);
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(true);
  });
});

describe('free-tier gate', () => {
  it('refuses to arm when the daily limit is used up and prompts once', () => {
    const exhausted = ctx({ scansUsedToday: 15 });
    const first = run(exhausted, [
      motion(1000, 8, 0, 0.02),
      motion(1100, 50, 200, 1.2),
    ]);

    expect(first.context.state).toBe('SLEEP');
    expect(hasEffect(first.effects, 'START_CAMERA')).toBe(false);
    expect(hasEffect(first.effects, 'SHOW_PAYWALL')).toBe(true);

    const second = run(first.context, [
      motion(3000, 8, 0, 0.02),
      motion(3100, 50, 200, 1.2),
    ]);
    expect(hasEffect(second.effects, 'SHOW_PAYWALL')).toBe(false);

    const third = run(second.context, [
      motion(11000, 8, 0, 0.02),
      motion(11100, 50, 200, 1.2),
    ]);
    expect(hasEffect(third.effects, 'SHOW_PAYWALL')).toBe(true);
  });

  it('lets paid users arm without counting against the cap', () => {
    const paid = ctx({ scansUsedToday: 99, unlimited: true });
    const result = run(paid, [
      motion(1000, 8, 0, 0.02),
      motion(1100, 50, 200, 1.2),
    ]);
    expect(result.context.state).toBe('PREWARM');
    expect(hasEffect(result.effects, 'SHOW_PAYWALL')).toBe(false);
  });

  it('reports remaining scans, or null when unlimited', () => {
    expect(remainingScans(ctx({ scansUsedToday: 4 }))).toBe(11);
    expect(remainingScans(ctx({ scansUsedToday: 99 }))).toBe(0);
    expect(remainingScans(ctx({ unlimited: true }))).toBeNull();
  });
});

describe('PREWARM settling', () => {
  it('requires focus/exposure settled plus 250ms of stillness', () => {
    const armed = raised(1000);
    const settled = run(armed, [
      { type: 'CAMERA_SETTLED', settled: true, timestampMs: 1100 },
      motion(1200, 55, 0, 0.05),
      { type: 'TICK', timestampMs: 1449 },
    ]);
    expect(settled.context.state).toBe('PREWARM');
    expect(hasEffect(settled.effects, 'CAPTURE_FRAME')).toBe(false);

    const fired = run(settled.context, [{ type: 'TICK', timestampMs: 1450 }]);
    expect(fired.context.state).toBe('SCANNING');
    expect(hasEffect(fired.effects, 'CAPTURE_FRAME')).toBe(true);
  });

  it('does not fire before focus/exposure settle', () => {
    const armed = raised(1000);
    const result = run(armed, [
      motion(1100, 55, 0, 0.05),
      { type: 'TICK', timestampMs: 2000 },
    ]);
    expect(result.context.state).toBe('PREWARM');
    expect(hasEffect(result.effects, 'CAPTURE_FRAME')).toBe(false);
  });

  it('respects the minimum prewarm time', () => {
    const armed = raised(1000);
    const early = run(armed, [
      { type: 'CAMERA_SETTLED', settled: true, timestampMs: 1010 },
      motion(1050, 55, 0, 0.05),
      { type: 'TICK', timestampMs: 1299 },
    ]);
    expect(early.context.state).toBe('PREWARM');

    const due = run(early.context, [{ type: 'TICK', timestampMs: 1300 }]);
    expect(due.context.state).toBe('SCANNING');
  });

  it('resets the still timer when the phone keeps moving', () => {
    const armed = raised(1000);
    const moving = run(armed, [
      { type: 'CAMERA_SETTLED', settled: true, timestampMs: 1100 },
      motion(1200, 55, 0, 0.05),
      motion(1300, 55, 0, 0.8),
      { type: 'TICK', timestampMs: 1500 },
    ]);
    expect(moving.context.state).toBe('PREWARM');
    expect(moving.context.stillSinceMs).toBeNull();

    const still = run(moving.context, [
      motion(1600, 55, 0, 0.05),
      { type: 'TICK', timestampMs: 1849 },
    ]);
    expect(still.context.state).toBe('PREWARM');

    const fired = run(still.context, [{ type: 'TICK', timestampMs: 1850 }]);
    expect(fired.context.state).toBe('SCANNING');
  });

  it('keeps a manually woken arm alive without motion sensors', () => {
    const woken = run(ctx({ hydrated: true, hasPitch: false, pitchDeg: 0 }), [
      { type: 'WAKE', timestampMs: 1000 },
    ]);
    expect(woken.context.state).toBe('PREWARM');

    const settled = run(woken.context, [
      { type: 'CAMERA_SETTLED', settled: true, timestampMs: 1100 },
      { type: 'TICK', timestampMs: 1400 },
    ]);
    expect(settled.context.state).toBe('SCANNING');
    expect(hasEffect(settled.effects, 'CAPTURE_FRAME')).toBe(true);
  });

  it('drops to SLEEP when the phone is lowered', () => {
    const armed = raised(1000);
    const result = run(armed, [motion(1200, 10, -200, 0.4)]);
    expect(result.context.state).toBe('SLEEP');
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
    expect(hasEffect(result.effects, 'DIM_SCREEN')).toBe(true);
  });

  it('sleeps on sustained walking variance', () => {
    let state = raised(1000);
    const effects: ScannerEffect[] = [];

    for (let i = 0; i < 8; i += 1) {
      const result = reduceScanner(
        state,
        motion(1100 + i * 100, 55, 0, i % 2 === 0 ? 0 : 1.4),
      );
      state = result.context;
      effects.push(...result.effects);
    }

    expect(state.state).toBe('SLEEP');
    expect(hasEffect(effects, 'STOP_CAMERA')).toBe(true);
  });

  it('times out an arm that never settles', () => {
    const armed = raised(1000);
    const result = run(armed, [{ type: 'TICK', timestampMs: 5000 }], {
      ...DEFAULT_TUNING,
      motionStaleMs: 10000,
    });
    expect(result.context.state).toBe('SLEEP');
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
  });

  it('powers down when motion samples stop arriving', () => {
    const armed = raised(1000);
    const result = run(armed, [{ type: 'TICK', timestampMs: 3600 }]);
    expect(result.context.state).toBe('SLEEP');
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
  });

  it('surfaces camera startup failure and sleeps', () => {
    const armed = raised(1000);
    const result = run(armed, [
      {
        type: 'CAMERA_FAILED',
        error: {
          code: 'permission_denied',
          message: 'Camera permission denied',
          fatal: true,
        },
        timestampMs: 1200,
      },
    ]);
    expect(result.context.state).toBe('SLEEP');
    expect(result.context.error?.code).toBe('permission_denied');
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
  });
});

describe('CAPTURE flow', () => {
  it('locks the result, stops the camera and counts the scan', () => {
    const result = run(scanning(1550), [
      { type: 'CAPTURE_SUCCEEDED', result: RESULT, timestampMs: 1800 },
    ]);

    expect(result.context.state).toBe('LOCKED_READ');
    expect(result.context.result).toBe(RESULT);
    expect(result.context.scansUsedToday).toBe(1);
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
    expect(hasEffect(result.effects, 'HAPTIC_SUCCESS')).toBe(true);
    expect(result.effects).toContainEqual({
      type: 'PERSIST_SCAN',
      dayKey: DAY,
      scansUsedToday: 1,
    });
  });

  it('discards a result that arrives after the phone was lowered', () => {
    const dropped = run(scanning(1550), [motion(1600, 10, -200, 0.4)]);
    const result = run(dropped.context, [
      { type: 'CAPTURE_SUCCEEDED', result: RESULT, timestampMs: 1900 },
    ]);

    expect(result.context.state).toBe('SLEEP');
    expect(result.context.scansUsedToday).toBe(0);
    expect(result.context.result).toBeNull();
    expect(result.effects).toEqual([]);
  });

  it('retries a transient capture failure by rearming', () => {
    const result = run(scanning(1550), [
      {
        type: 'CAPTURE_FAILED',
        error: { code: 'no_text', message: 'No readable text', fatal: false },
        timestampMs: 1800,
      },
    ]);

    expect(result.context.state).toBe('PREWARM');
    expect(result.context.attemptsThisArm).toBe(1);
    expect(result.context.error?.code).toBe('no_text');
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(true);
    expect(result.context.armedAtMs).toBe(1800);
  });

  it('stops retrying after the attempt cap', () => {
    const result = run(
      ctx({
        state: 'SCANNING',
        pitchDeg: 55,
        cameraSettled: true,
        attemptsThisArm: 2,
        armedAtMs: 1000,
        lastMotionAtMs: 1500,
      }),
      [
        {
          type: 'CAPTURE_FAILED',
          error: { code: 'no_text', message: 'No readable text', fatal: false },
          timestampMs: 1600,
        },
      ],
    );

    expect(result.context.state).toBe('SLEEP');
    expect(result.context.error?.code).toBe('no_text');
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
  });

  it('does not retry fatal failures such as a missing language pack', () => {
    const result = run(scanning(1550), [
      {
        type: 'CAPTURE_FAILED',
        error: {
          code: 'language_pack_missing',
          message: 'Japanese pack not installed',
          language: 'ja',
          fatal: true,
        },
        timestampMs: 1800,
      },
    ]);

    expect(result.context.state).toBe('SLEEP');
    expect(result.context.error?.language).toBe('ja');
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(false);
  });
});

describe('LOCKED_READ hysteresis', () => {
  function locked(): ScannerContext {
    return run(scanning(1550), [
      { type: 'CAPTURE_SUCCEEDED', result: RESULT, timestampMs: 1800 },
    ]).context;
  }

  it('ignores micro-drift and re-aiming', () => {
    const state = locked();
    const result = run(state, [
      motion(1900, 55, 250, 2.0),
      motion(2000, 70, 120, 1.1),
      { type: 'TICK', timestampMs: 2300 },
    ]);
    expect(result.context.state).toBe('LOCKED_READ');
    expect(hasEffect(result.effects, 'CAPTURE_FRAME')).toBe(false);
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(false);
  });

  it('sleeps when lowered', () => {
    const result = run(locked(), [motion(2000, 10, -220, 0.5)]);
    expect(result.context.state).toBe('SLEEP');
    expect(result.context.result).toBeNull();
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
  });

  it('sleeps when the reader starts walking', () => {
    let state = locked();
    const effects: ScannerEffect[] = [];
    for (let i = 0; i < 9; i += 1) {
      const result = reduceScanner(
        state,
        motion(1900 + i * 100, 55, 0, i % 2 === 0 ? 0 : 1.4),
      );
      state = result.context;
      effects.push(...result.effects);
    }
    expect(state.state).toBe('SLEEP');
    expect(hasEffect(effects, 'STOP_CAMERA')).toBe(true);
  });

  it('re-arms on Scan Again when scans remain', () => {
    const result = run(locked(), [{ type: 'SCAN_AGAIN', timestampMs: 3000 }]);
    expect(result.context.state).toBe('PREWARM');
    expect(result.context.result).toBeNull();
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(true);
  });

  it('keeps the result visible and opens the paywall when out of scans', () => {
    const result = run(
      { ...locked(), scansUsedToday: 15 },
      [{ type: 'SCAN_AGAIN', timestampMs: 3000 }],
    );
    expect(result.context.state).toBe('LOCKED_READ');
    expect(result.context.result).not.toBeNull();
    expect(hasEffect(result.effects, 'SHOW_PAYWALL')).toBe(true);
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(false);
  });
});

describe('counter and lifecycle events', () => {
  it('resets the counter on local day rollover', () => {
    const rolled = run(ctx({ scansUsedToday: 12 }), [
      {
        type: 'DAY_ROLLOVER',
        dayKey: '2026-11-22',
        scansUsedToday: 0,
        timestampMs: 1000,
      },
    ]);
    expect(rolled.context.scansUsedToday).toBe(0);
    expect(rolled.context.dayKey).toBe('2026-11-22');
    expect(remainingScans(rolled.context)).toBe(15);
  });

  it('updates the unlimited flag when entitlements change', () => {
    const result = run(ctx({ scansUsedToday: 15 }), [
      { type: 'ENTITLEMENT_CHANGED', unlimited: true, timestampMs: 1000 },
      { type: 'WAKE', timestampMs: 1100 },
    ]);
    expect(result.context.state).toBe('PREWARM');
    expect(hasEffect(result.effects, 'SHOW_PAYWALL')).toBe(false);
  });

  it('clears the result and camera when explicitly sleeping', () => {
    const result = run(
      ctx({ state: 'LOCKED_READ', result: RESULT, pitchDeg: 55 }),
      [{ type: 'SLEEP', timestampMs: 2000 }],
    );
    expect(result.context.state).toBe('SLEEP');
    expect(result.context.result).toBeNull();
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
  });

  it('hydrates day, count and entitlement', () => {
    const result = run(ctx({ hydrated: false }), [
      {
        type: 'HYDRATE',
        dayKey: '2026-11-21',
        scansUsedToday: 3,
        unlimited: false,
        timestampMs: 1000,
      },
    ]);
    expect(result.context.hydrated).toBe(true);
    expect(result.context.scansUsedToday).toBe(3);
    expect(remainingScans(result.context)).toBe(12);
  });

  it('refuses to arm before hydration finishes', () => {
    const result = run(ctx({ hydrated: false }), [
      motion(1000, 8, 0, 0.02),
      motion(1100, 50, 200, 1.2),
      { type: 'WAKE', timestampMs: 1200 },
    ]);
    expect(result.context.state).toBe('SLEEP');
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(false);
  });

  it('dismisses a fatal error without changing state', () => {
    const result = run(
      ctx({
        error: { code: 'language_pack_missing', message: 'missing', fatal: true },
      }),
      [{ type: 'DISMISS_ERROR', timestampMs: 1000 }],
    );
    expect(result.context.error).toBeNull();
    expect(result.context.state).toBe('SLEEP');
  });
});
