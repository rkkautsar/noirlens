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
  kind: 'translated',
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

/**
 * Fast raise from below the band, then 310 ms in the band. The reducer arms on
 * the third sample at t+310, so the helper returns a PREWARM context armed at
 * `timestampMs + 310`.
 */
function raised(timestampMs = 1000): ScannerContext {
  return run(ctx(), [
    motion(timestampMs - 100, 8, 0, 0.02),
    motion(timestampMs, 55, 180, 1.4),
    motion(timestampMs + 310, 55, 0, 0.05),
  ]).context;
}

/** AUTO arm at t=1310, camera settles at 1350, still hold ends at 1610. */
function scanning(): ScannerContext {
  const armed = raised(1000);
  return run(armed, [
    { type: 'CAMERA_SETTLED', settled: true, timestampMs: 1350 },
    motion(1400, 55, 0, 0.05),
    { type: 'TICK', timestampMs: 1610 },
  ]).context;
}

function hasEffect(effects: ScannerEffect[], type: ScannerEffect['type']): boolean {
  return effects.some((effect) => effect.type === type);
}

describe('SLEEP arm gesture', () => {
  it('arms after entering the band and dwelling, not on entry alone', () => {
    const entering = run(ctx(), [
      motion(1000, 8, 0, 0.02),
      motion(1100, 50, 120, 1.2),
    ]);
    expect(entering.context.state).toBe('SLEEP');
    expect(hasEffect(entering.effects, 'START_CAMERA')).toBe(false);

    const dwelled = run(entering.context, [motion(1410, 50, 0, 0.05)]);
    expect(dwelled.context.state).toBe('PREWARM');
    expect(dwelled.context.armMode).toBe('AUTO');
    expect(hasEffect(dwelled.effects, 'START_CAMERA')).toBe(true);
  });

  it('does not arm when the phone only passes through the band', () => {
    const result = run(ctx(), [
      motion(1000, 0, 0, 0.02),
      motion(1100, 50, 200, 1.4),
      motion(1200, 10, -200, 0.8),
    ]);
    expect(result.context.state).toBe('SLEEP');
    expect(result.context.armCandidateAtMs).toBeNull();
  });

  it('ignores a jolt that starts inside the band', () => {
    const result = run(ctx({ pitchDeg: 60 }), [
      motion(1000, 60, 300, 1.0),
      motion(1310, 60, 0, 0.05),
    ]);
    expect(result.context.state).toBe('SLEEP');
    expect(result.effects).toEqual([]);
  });

  it('ignores a slow lift', () => {
    const result = run(ctx(), [
      motion(1000, 8, 0, 0.02),
      motion(1100, 50, 10, 0.3),
      motion(1410, 50, 0, 0.05),
    ]);
    expect(result.context.state).toBe('SLEEP');
    expect(result.effects).toEqual([]);
  });

  it('ignores an entry after the outside-band window expires', () => {
    const result = run(ctx(), [
      motion(1000, 8, 0, 0.02),
      motion(2500, 50, 200, 1.2),
      motion(2810, 50, 0, 0.05),
    ]);
    expect(result.context.state).toBe('SLEEP');
  });

  it('arms when tilting down from a vertical pocket into the band', () => {
    const result = run(ctx(), [
      motion(1000, 90, 0, 0.02),
      motion(1100, 60, -160, 1.2),
      motion(1410, 60, 0, 0.05),
    ]);
    expect(result.context.state).toBe('PREWARM');
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(true);
  });

  it('respects the post-sleep cooldown before arming', () => {
    const slept = ctx({ sleepAtMs: 1000 });
    const early = run(slept, [
      motion(1200, 8, 0, 0.02),
      motion(1300, 50, 200, 1.2),
      motion(1610, 50, 0, 0.05),
    ]);
    expect(early.context.state).toBe('SLEEP');
    expect(early.context.armCandidateAtMs).toBeNull();

    const late = run(early.context, [
      motion(1900, 8, 0, 0.02),
      motion(2000, 50, 200, 1.2),
      motion(2310, 50, 0, 0.05),
    ]);
    expect(late.context.state).toBe('PREWARM');
  });

  it('starts MANUAL mode from the standby button', () => {
    const result = run(ctx({ pitchDeg: 0 }), [
      { type: 'WAKE', timestampMs: 500 },
    ]);
    expect(result.context.state).toBe('PREWARM');
    expect(result.context.armMode).toBe('MANUAL');
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
      motion(1410, 50, 0, 0.05),
    ]);

    expect(first.context.state).toBe('SLEEP');
    expect(hasEffect(first.effects, 'START_CAMERA')).toBe(false);
    expect(hasEffect(first.effects, 'SHOW_PAYWALL')).toBe(true);

    const second = run(first.context, [
      motion(3000, 8, 0, 0.02),
      motion(3100, 50, 200, 1.2),
      motion(3410, 50, 0, 0.05),
    ]);
    expect(hasEffect(second.effects, 'SHOW_PAYWALL')).toBe(false);

    const third = run(second.context, [
      motion(11000, 8, 0, 0.02),
      motion(11100, 50, 200, 1.2),
      motion(11410, 50, 0, 0.05),
    ]);
    expect(hasEffect(third.effects, 'SHOW_PAYWALL')).toBe(true);
  });

  it('lets paid users arm without counting against the cap', () => {
    const paid = ctx({ scansUsedToday: 99, unlimited: true });
    const result = run(paid, [
      motion(1000, 8, 0, 0.02),
      motion(1100, 50, 200, 1.2),
      motion(1410, 50, 0, 0.05),
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
  it('requires focus/exposure settled plus the still hold and prewarm minimum', () => {
    const armed = raised(1000); // armed at 1310
    const early = run(armed, [
      { type: 'CAMERA_SETTLED', settled: true, timestampMs: 1350 },
      { type: 'TICK', timestampMs: 1599 },
    ]);
    expect(early.context.state).toBe('PREWARM');

    const stillHoldDue = run(early.context, [{ type: 'TICK', timestampMs: 1600 }]);
    expect(stillHoldDue.context.state).toBe('PREWARM'); // armedFor 290 ms

    const fired = run(stillHoldDue.context, [{ type: 'TICK', timestampMs: 1610 }]);
    expect(fired.context.state).toBe('SCANNING');
    expect(hasEffect(fired.effects, 'CAPTURE_FRAME')).toBe(true);
  });

  it('does not fire before focus/exposure settle', () => {
    const result = run(raised(1000), [
      motion(1400, 55, 0, 0.05),
      { type: 'TICK', timestampMs: 2000 },
    ]);
    expect(result.context.state).toBe('PREWARM');
    expect(hasEffect(result.effects, 'CAPTURE_FRAME')).toBe(false);
  });

  it('respects the minimum prewarm time', () => {
    const early = run(raised(1000), [
      { type: 'CAMERA_SETTLED', settled: true, timestampMs: 1320 },
      { type: 'TICK', timestampMs: 1609 },
    ]);
    expect(early.context.state).toBe('PREWARM');

    const due = run(early.context, [{ type: 'TICK', timestampMs: 1610 }]);
    expect(due.context.state).toBe('SCANNING');
  });

  it('resets the still timer when the phone keeps moving', () => {
    const moving = run(raised(1000), [
      { type: 'CAMERA_SETTLED', settled: true, timestampMs: 1350 },
      motion(1400, 55, 0, 0.05),
      motion(1500, 55, 0, 0.8),
      { type: 'TICK', timestampMs: 1600 },
    ]);
    expect(moving.context.state).toBe('PREWARM');
    expect(moving.context.stillSinceMs).toBeNull();

    const still = run(moving.context, [
      motion(1700, 55, 0, 0.05),
      { type: 'TICK', timestampMs: 1949 },
    ]);
    expect(still.context.state).toBe('PREWARM');

    const fired = run(still.context, [{ type: 'TICK', timestampMs: 1950 }]);
    expect(fired.context.state).toBe('SCANNING');
  });

  it('keeps a manual session open without motion and captures on demand', () => {
    const woken = run(ctx({ hydrated: true, hasPitch: false, pitchDeg: 0 }), [
      { type: 'WAKE', timestampMs: 1000 },
    ]);
    expect(woken.context.state).toBe('PREWARM');
    expect(woken.context.armMode).toBe('MANUAL');

    const settled = run(woken.context, [
      { type: 'CAMERA_SETTLED', settled: true, timestampMs: 1100 },
      { type: 'TICK', timestampMs: 3000 },
    ]);
    expect(settled.context.state).toBe('PREWARM');
    expect(hasEffect(settled.effects, 'CAPTURE_FRAME')).toBe(false);

    const captured = run(settled.context, [
      { type: 'CAPTURE_NOW', timestampMs: 3100 },
    ]);
    expect(captured.context.state).toBe('SCANNING');
    expect(hasEffect(captured.effects, 'CAPTURE_FRAME')).toBe(true);
  });

  it('ignores drops and walking in a manual session', () => {
    const woken = run(ctx(), [{ type: 'WAKE', timestampMs: 1000 }]).context;
    const result = run(woken, [
      motion(1200, 5, -200, 0.5),
      motion(1300, 5, 0, 0.5),
      { type: 'TICK', timestampMs: 1600 },
    ]);
    expect(result.context.state).toBe('PREWARM');
  });

  it('stops a manual session on demand', () => {
    const woken = run(ctx(), [{ type: 'WAKE', timestampMs: 1000 }]).context;
    const result = run(woken, [{ type: 'STOP', timestampMs: 2000 }]);
    expect(result.context.state).toBe('SLEEP');
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
  });

  it('times out a manual session eventually', () => {
    const woken = run(ctx(), [{ type: 'WAKE', timestampMs: 1000 }]).context;
    const result = run(woken, [{ type: 'TICK', timestampMs: 100_000 }]);
    expect(result.context.state).toBe('SLEEP');
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
  });

  it('drops to SLEEP when an AUTO arm is lowered', () => {
    const result = run(raised(1000), [motion(1400, 10, -200, 0.4)]);
    expect(result.context.state).toBe('SLEEP');
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
  });

  it('sleeps on sustained walking variance in AUTO', () => {
    let state = raised(1000);
    const effects: ScannerEffect[] = [];

    for (let i = 0; i < 8; i += 1) {
      const result = reduceScanner(
        state,
        motion(1400 + i * 100, 55, 0, i % 2 === 0 ? 0 : 1.4),
      );
      state = result.context;
      effects.push(...result.effects);
    }

    expect(state.state).toBe('SLEEP');
    expect(hasEffect(effects, 'STOP_CAMERA')).toBe(true);
  });

  it('times out an AUTO arm that never settles', () => {
    const result = run(raised(1000), [{ type: 'TICK', timestampMs: 6000 }], {
      ...DEFAULT_TUNING,
      motionStaleMs: 10000,
    });
    expect(result.context.state).toBe('SLEEP');
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
  });

  it('powers down an AUTO session when motion samples stop arriving', () => {
    const result = run(raised(1000), [{ type: 'TICK', timestampMs: 4000 }]);
    expect(result.context.state).toBe('SLEEP');
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
  });

  it('surfaces camera startup failure and sleeps', () => {
    const result = run(raised(1000), [
      {
        type: 'CAMERA_FAILED',
        error: {
          code: 'permission_denied',
          message: 'Camera permission denied',
          fatal: true,
        },
        timestampMs: 1400,
      },
    ]);
    expect(result.context.state).toBe('SLEEP');
    expect(result.context.error?.code).toBe('permission_denied');
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
  });
});

describe('CAPTURE flow', () => {
  it('locks the result, stops the camera and counts the scan', () => {
    const result = run(scanning(), [
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

  it('shows a missing-pack result without charging a scan', () => {
    const result = run(scanning(), [
      {
        type: 'CAPTURE_SUCCEEDED',
        result: {
          ...RESULT,
          kind: 'pack_missing',
          translatedText: '',
          sourceLanguage: 'de',
        },
        timestampMs: 1800,
      },
    ]);

    expect(result.context.state).toBe('LOCKED_READ');
    expect(result.context.scansUsedToday).toBe(0);
    expect(result.context.result?.kind).toBe('pack_missing');
    expect(hasEffect(result.effects, 'PERSIST_SCAN')).toBe(false);
    expect(hasEffect(result.effects, 'HAPTIC_ERROR')).toBe(true);
  });

  it('shows an English detection without charging a scan', () => {
    const result = run(scanning(), [
      {
        type: 'CAPTURE_SUCCEEDED',
        result: {
          ...RESULT,
          kind: 'english',
          translatedText: '',
          sourceLanguage: 'en',
        },
        timestampMs: 1800,
      },
    ]);

    expect(result.context.state).toBe('LOCKED_READ');
    expect(result.context.scansUsedToday).toBe(0);
    expect(result.context.result?.kind).toBe('english');
    expect(hasEffect(result.effects, 'PERSIST_SCAN')).toBe(false);
  });

  it('discards a result that arrives after the phone was lowered', () => {
    const dropped = run(scanning(), [motion(1700, 10, -200, 0.4)]);
    const result = run(dropped.context, [
      { type: 'CAPTURE_SUCCEEDED', result: RESULT, timestampMs: 1900 },
    ]);

    expect(result.context.state).toBe('SLEEP');
    expect(result.context.scansUsedToday).toBe(0);
    expect(result.context.result).toBeNull();
    expect(result.effects).toEqual([]);
  });

  it('retries a transient capture failure by rearming', () => {
    const result = run(scanning(), [
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
    expect(result.context.armMode).toBe('AUTO');
  });

  it('returns a manual scan to standby after a failed capture', () => {
    const woken = run(ctx(), [{ type: 'WAKE', timestampMs: 1000 }]).context;
    const captured = run(woken, [
      { type: 'CAPTURE_NOW', timestampMs: 1100 },
    ]).context;
    const result = run(captured, [
      {
        type: 'CAPTURE_FAILED',
        error: { code: 'no_text', message: 'No readable text', fatal: false },
        timestampMs: 1200,
      },
    ]);
    expect(result.context.state).toBe('SLEEP');
    expect(result.context.error?.code).toBe('no_text');
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(false);
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
    const result = run(scanning(), [
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
    return run(scanning(), [
      { type: 'CAPTURE_SUCCEEDED', result: RESULT, timestampMs: 1800 },
    ]).context;
  }

  it('ignores micro-drift and re-aiming', () => {
    const result = run(locked(), [
      motion(1900, 55, 250, 2.0),
      motion(2000, 70, 120, 1.1),
      { type: 'TICK', timestampMs: 2300 },
    ]);
    expect(result.context.state).toBe('LOCKED_READ');
    expect(hasEffect(result.effects, 'CAPTURE_FRAME')).toBe(false);
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(false);
  });

  it('keeps the result when lowered', () => {
    const result = run(locked(), [motion(2000, 10, -220, 0.5)]);
    expect(result.context.state).toBe('LOCKED_READ');
    expect(result.context.result).toBe(RESULT);
    expect(result.effects).toEqual([]);
  });

  it('keeps the result when the reader starts walking', () => {
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
    expect(state.state).toBe('LOCKED_READ');
    expect(state.result).toBe(RESULT);
    expect(effects).toEqual([]);
  });

  it('returns to standby so the next scan can be held', () => {
    const result = run(locked(), [{ type: 'SCAN_AGAIN', timestampMs: 3000 }]);
    expect(result.context.state).toBe('SLEEP');
    expect(result.context.result).toBeNull();
    expect(hasEffect(result.effects, 'START_CAMERA')).toBe(false);
    expect(hasEffect(result.effects, 'STOP_CAMERA')).toBe(true);
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
  it('refuses a manual capture when the daily limit is used up', () => {
    const woken = run(ctx({ scansUsedToday: 15 }), [
      { type: 'WAKE', timestampMs: 1000 },
    ]);
    expect(woken.context.state).toBe('SLEEP');
    expect(hasEffect(woken.effects, 'SHOW_PAYWALL')).toBe(true);

    const captured = run(
      ctx({ scansUsedToday: 15, state: 'PREWARM', hydrated: true }),
      [{ type: 'CAPTURE_NOW', timestampMs: 2000 }],
    );
    expect(captured.context.state).toBe('SLEEP');
    expect(hasEffect(captured.effects, 'SHOW_PAYWALL')).toBe(true);
    expect(hasEffect(captured.effects, 'CAPTURE_FRAME')).toBe(false);
  });

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
