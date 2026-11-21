/**
 * Pure, deterministic hardware lifecycle reducer for the NoirLens scanner.
 *
 * The reducer never touches native APIs. It emits effects that the controller
 * (`src/scanner/controller.ts`) executes: camera start/stop, single-frame
 * capture, screen dimming and scan persistence. This keeps every power-gating
 * decision unit-testable.
 */

export const FREE_DAILY_SCAN_LIMIT = 15;

export type ScannerState = 'SLEEP' | 'PREWARM' | 'SCANNING' | 'LOCKED_READ';

export interface ScanBlock {
  text: string;
  confidence: number;
  /** Normalized 0..1 coordinates, top-left origin, relative to the upright frame. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScanResult {
  sourceText: string;
  translatedText: string;
  /** BCP-47 code reported by on-device language identification. */
  sourceLanguage: string;
  sourceHash: string;
  blocks: ScanBlock[];
  imageWidth: number;
  imageHeight: number;
  cached: boolean;
  /** Low-quality JPEG of the captured frame, used only for the frozen "original" view. */
  previewJpegBase64?: string;
}

export type ScanFailureCode =
  | 'no_text'
  | 'camera_unavailable'
  | 'permission_denied'
  | 'language_pack_missing'
  | 'translation_failed'
  | 'capture_failed';

export interface ScanError {
  code: ScanFailureCode;
  message: string;
  language?: string;
  /** Fatal errors stop the arm loop; transient ones retry automatically. */
  fatal: boolean;
}

export interface MotionSample {
  /** Wall-clock milliseconds (Date.now). */
  timestampMs: number;
  /** 0 = flat on a table, 90 = upright facing the user, negative = upside down. */
  pitchDeg: number;
  pitchRateDegSec: number;
  angularSpeedRadSec: number;
}

interface MotionEnergySample {
  t: number;
  /** Angular speed magnitude in rad/s. */
  w: number;
}

export interface ScannerTuning {
  /** Pitch band that arms the camera. */
  minPitchDeg: number;
  maxPitchDeg: number;
  /** Below this pitch the phone is considered lowered. */
  dropPitchDeg: number;
  /**
   * Minimum rotational speed while entering the arm band (deg/s). Absolute
   * value: lifting from a table and tilting down from a vertical pocket are
   * both intentional arms.
   */
  minArmRateDegSec: number;
  /** The phone must have left the arm band within this window. */
  armEntryWindowMs: number;
  /** Rotation slower than this counts as "held still" (rad/s). */
  stillAngularSpeedRadSec: number;
  /** How long the phone must be still before the shutter fires. */
  stillHoldMs: number;
  /** Minimum time after arming before a capture is allowed (ms). */
  prewarmMinMs: number;
  /** Abort the arm if nothing settles within this time (ms). */
  prewarmTimeoutMs: number;
  /** Window used to distinguish walking from a steady hold. */
  walkingWindowMs: number;
  /** Variance of angular speed above which we treat the user as walking. */
  walkingVariance: number;
  walkingMinSamples: number;
  /** If no motion sample arrives for this long while active, power down. */
  motionStaleMs: number;
  maxCaptureAttempts: number;
  freeDailyLimit: number;
  /** Don't reopen the paywall on every raise. */
  paywallRetriggerMs: number;
}

export const DEFAULT_TUNING: ScannerTuning = {
  minPitchDeg: 20,
  maxPitchDeg: 85,
  dropPitchDeg: 15,
  minArmRateDegSec: 30,
  armEntryWindowMs: 1000,
  stillAngularSpeedRadSec: 0.15,
  stillHoldMs: 250,
  prewarmMinMs: 300,
  prewarmTimeoutMs: 4000,
  walkingWindowMs: 600,
  walkingVariance: 0.35,
  walkingMinSamples: 8,
  motionStaleMs: 2500,
  maxCaptureAttempts: 3,
  freeDailyLimit: FREE_DAILY_SCAN_LIMIT,
  paywallRetriggerMs: 8000,
};

export interface ScannerContext {
  state: ScannerState;
  dayKey: string;
  scansUsedToday: number;
  unlimited: boolean;
  hydrated: boolean;
  result: ScanResult | null;
  error: ScanError | null;
  nowMs: number;
  pitchDeg: number;
  angularSpeedRadSec: number;
  /** False until the first motion sample (or forever when sensors are off). */
  hasPitch: boolean;
  lastMotionAtMs: number | null;
  /** Last moment the phone was outside the arm band. */
  outsideBandAtMs: number | null;
  armedAtMs: number | null;
  stillSinceMs: number | null;
  cameraSettled: boolean;
  attemptsThisArm: number;
  motionHistory: readonly MotionEnergySample[];
  paywallPromptedAtMs: number | null;
}

export type ScannerEffect =
  | { type: 'START_CAMERA' }
  | { type: 'STOP_CAMERA' }
  | { type: 'CAPTURE_FRAME' }
  | { type: 'DIM_SCREEN' }
  | { type: 'RESTORE_BRIGHTNESS' }
  | { type: 'PERSIST_SCAN'; dayKey: string; scansUsedToday: number }
  | { type: 'SHOW_PAYWALL' }
  | { type: 'HAPTIC_SUCCESS' }
  | { type: 'HAPTIC_ERROR' };

export type ScannerEvent =
  | {
      type: 'HYDRATE';
      dayKey: string;
      scansUsedToday: number;
      unlimited: boolean;
      timestampMs: number;
    }
  | { type: 'MOTION'; sample: MotionSample }
  | { type: 'TICK'; timestampMs: number }
  | { type: 'CAMERA_SETTLED'; settled: boolean; timestampMs: number }
  | { type: 'CAMERA_FAILED'; error: ScanError; timestampMs: number }
  | { type: 'CAPTURE_SUCCEEDED'; result: ScanResult; timestampMs: number }
  | { type: 'CAPTURE_FAILED'; error: ScanError; timestampMs: number }
  | { type: 'WAKE'; timestampMs: number }
  | { type: 'SCAN_AGAIN'; timestampMs: number }
  | { type: 'SLEEP'; timestampMs: number }
  | { type: 'DISMISS_ERROR'; timestampMs: number }
  | { type: 'ENTITLEMENT_CHANGED'; unlimited: boolean; timestampMs: number }
  | {
      type: 'DAY_ROLLOVER';
      dayKey: string;
      scansUsedToday: number;
      timestampMs: number;
    };

export interface ReduceResult {
  context: ScannerContext;
  effects: ScannerEffect[];
}

export function createInitialContext(params: {
  dayKey: string;
  scansUsedToday?: number;
  unlimited?: boolean;
  hydrated?: boolean;
  nowMs?: number;
}): ScannerContext {
  return {
    state: 'SLEEP',
    dayKey: params.dayKey,
    scansUsedToday: params.scansUsedToday ?? 0,
    unlimited: params.unlimited ?? false,
    hydrated: params.hydrated ?? false,
    result: null,
    error: null,
    nowMs: params.nowMs ?? 0,
    pitchDeg: 0,
    angularSpeedRadSec: 0,
    hasPitch: false,
    lastMotionAtMs: null,
    outsideBandAtMs: null,
    armedAtMs: null,
    stillSinceMs: null,
    cameraSettled: false,
    attemptsThisArm: 0,
    motionHistory: [],
    paywallPromptedAtMs: null,
  };
}

export function remainingScans(
  context: Pick<ScannerContext, 'unlimited' | 'scansUsedToday'>,
  tuning: ScannerTuning = DEFAULT_TUNING,
): number | null {
  if (context.unlimited) {
    return null;
  }
  return Math.max(0, tuning.freeDailyLimit - context.scansUsedToday);
}

function canScan(context: ScannerContext, tuning: ScannerTuning): boolean {
  return context.unlimited || context.scansUsedToday < tuning.freeDailyLimit;
}

function appendEnergy(
  history: readonly MotionEnergySample[],
  sample: MotionEnergySample,
  tuning: ScannerTuning,
): readonly MotionEnergySample[] {
  const cutoff = sample.t - tuning.walkingWindowMs * 2;
  const next = [...history.filter((entry) => entry.t >= cutoff), sample];
  return next.length > 64 ? next.slice(next.length - 64) : next;
}

function isWalking(
  history: readonly MotionEnergySample[],
  tuning: ScannerTuning,
): boolean {
  if (history.length < tuning.walkingMinSamples) {
    return false;
  }
  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last || last.t - first.t < tuning.walkingWindowMs * 0.8) {
    return false;
  }
  let sum = 0;
  for (const entry of history) {
    sum += entry.w;
  }
  const mean = sum / history.length;
  let variance = 0;
  for (const entry of history) {
    const delta = entry.w - mean;
    variance += delta * delta;
  }
  variance /= history.length;
  return variance >= tuning.walkingVariance;
}

function enterSleep(
  context: ScannerContext,
  effects: ScannerEffect[],
  options: { clearResult: boolean; emitStop: boolean },
): ScannerContext {
  effects.push({ type: 'STOP_CAMERA' });
  if (context.state !== 'SLEEP') {
    effects.push({ type: 'DIM_SCREEN' });
  }
  return {
    ...context,
    state: 'SLEEP',
    result: options.clearResult ? null : context.result,
    armedAtMs: null,
    stillSinceMs: null,
    cameraSettled: false,
    attemptsThisArm: 0,
    outsideBandAtMs: null,
    motionHistory: [],
  };
}

function enterPrewarm(
  context: ScannerContext,
  effects: ScannerEffect[],
  timestampMs: number,
  options: { resetAttempts: boolean; clearError: boolean },
): ScannerContext {
  effects.push({ type: 'RESTORE_BRIGHTNESS' }, { type: 'START_CAMERA' });
  return {
    ...context,
    state: 'PREWARM',
    result: null,
    error: options.clearError ? null : context.error,
    armedAtMs: timestampMs,
    stillSinceMs: null,
    cameraSettled: false,
    attemptsThisArm: options.resetAttempts ? 0 : context.attemptsThisArm,
    motionHistory: [],
    outsideBandAtMs: null,
    nowMs: timestampMs,
  };
}

function showPaywallIfDue(
  context: ScannerContext,
  timestampMs: number,
  tuning: ScannerTuning,
  effects: ScannerEffect[],
): ScannerContext {
  const lastPrompt = context.paywallPromptedAtMs;
  if (lastPrompt === null || timestampMs - lastPrompt >= tuning.paywallRetriggerMs) {
    effects.push({ type: 'SHOW_PAYWALL' });
    return { ...context, paywallPromptedAtMs: timestampMs };
  }
  return context;
}

function attemptArm(
  context: ScannerContext,
  timestampMs: number,
  tuning: ScannerTuning,
  effects: ScannerEffect[],
): ScannerContext {
  // Never scan before the persisted daily counter is known, otherwise the
  // first scan could overwrite the stored count during hydration.
  if (!context.hydrated) {
    return context;
  }
  if (!canScan(context, tuning)) {
    return showPaywallIfDue(context, timestampMs, tuning, effects);
  }
  return enterPrewarm(context, effects, timestampMs, {
    resetAttempts: true,
    clearError: true,
  });
}

function evaluateActive(
  context: ScannerContext,
  timestampMs: number,
  tuning: ScannerTuning,
  effects: ScannerEffect[],
): ScannerContext {
  if (context.state === 'SLEEP') {
    return context;
  }

  if (context.hasPitch && context.pitchDeg < tuning.dropPitchDeg) {
    return enterSleep(context, effects, { clearResult: true, emitStop: true });
  }

  if (isWalking(context.motionHistory, tuning)) {
    return enterSleep(context, effects, { clearResult: true, emitStop: true });
  }

  if (context.state === 'PREWARM') {
    const armedAt = context.armedAtMs ?? timestampMs;
    if (timestampMs - armedAt >= tuning.prewarmTimeoutMs) {
      return enterSleep(context, effects, { clearResult: true, emitStop: true });
    }

    const settled =
      context.cameraSettled &&
      context.angularSpeedRadSec < tuning.stillAngularSpeedRadSec;

    if (!settled) {
      return { ...context, stillSinceMs: null };
    }

    const stillSince = context.stillSinceMs ?? timestampMs;
    const stillFor = timestampMs - stillSince;
    const armedFor = timestampMs - armedAt;

    if (armedFor >= tuning.prewarmMinMs && stillFor >= tuning.stillHoldMs) {
      if (!canScan(context, tuning)) {
        const prompted = showPaywallIfDue(
          context,
          timestampMs,
          tuning,
          effects,
        );
        return enterSleep(prompted, effects, {
          clearResult: true,
          emitStop: true,
        });
      }
      effects.push({ type: 'CAPTURE_FRAME' });
      return {
        ...context,
        state: 'SCANNING',
        stillSinceMs: null,
        nowMs: timestampMs,
      };
    }

    return { ...context, stillSinceMs: stillSince, nowMs: timestampMs };
  }

  return { ...context, nowMs: timestampMs };
}

function onMotion(
  context: ScannerContext,
  sample: MotionSample,
  tuning: ScannerTuning,
  effects: ScannerEffect[],
): ScannerContext {
  const history = appendEnergy(
    context.motionHistory,
    { t: sample.timestampMs, w: sample.angularSpeedRadSec },
    tuning,
  );

  const next: ScannerContext = {
    ...context,
    nowMs: sample.timestampMs,
    pitchDeg: sample.pitchDeg,
    angularSpeedRadSec: sample.angularSpeedRadSec,
    hasPitch: true,
    lastMotionAtMs: sample.timestampMs,
    motionHistory: history,
  };

  if (next.state === 'SLEEP') {
    const outside =
      sample.pitchDeg < tuning.minPitchDeg ||
      sample.pitchDeg > tuning.maxPitchDeg
        ? sample.timestampMs
        : next.outsideBandAtMs;

    const enteredBand =
      outside !== null &&
      sample.timestampMs - outside <= tuning.armEntryWindowMs;

    const inBand =
      sample.pitchDeg >= tuning.minPitchDeg &&
      sample.pitchDeg <= tuning.maxPitchDeg;

    if (
      inBand &&
      enteredBand &&
      Math.abs(sample.pitchRateDegSec) >= tuning.minArmRateDegSec
    ) {
      return attemptArm(
        { ...next, outsideBandAtMs: outside },
        sample.timestampMs,
        tuning,
        effects,
      );
    }

    return { ...next, outsideBandAtMs: outside };
  }

  if (next.state === 'LOCKED_READ') {
    // Hysteresis: micro-drift and re-aiming inside the band must not re-arm.
    if (sample.pitchDeg < tuning.dropPitchDeg) {
      return enterSleep(next, effects, { clearResult: true, emitStop: true });
    }
    if (isWalking(history, tuning)) {
      return enterSleep(next, effects, { clearResult: true, emitStop: true });
    }
    return next;
  }

  return evaluateActive(next, sample.timestampMs, tuning, effects);
}

export function reduceScanner(
  context: ScannerContext,
  event: ScannerEvent,
  tuning: ScannerTuning = DEFAULT_TUNING,
): ReduceResult {
  const effects: ScannerEffect[] = [];

  switch (event.type) {
    case 'HYDRATE': {
      return {
        context: {
          ...context,
          hydrated: true,
          dayKey: event.dayKey,
          scansUsedToday: event.scansUsedToday,
          unlimited: event.unlimited,
          nowMs: event.timestampMs,
        },
        effects,
      };
    }

    case 'MOTION': {
      return {
        context: onMotion(context, event.sample, tuning, effects),
        effects,
      };
    }

    case 'TICK': {
      const next = { ...context, nowMs: event.timestampMs };
      if (next.state === 'SLEEP') {
        return { context: next, effects };
      }
      if (
        next.lastMotionAtMs !== null &&
        event.timestampMs - next.lastMotionAtMs > tuning.motionStaleMs
      ) {
        return {
          context: enterSleep(next, effects, {
            clearResult: true,
            emitStop: true,
          }),
          effects,
        };
      }
      return {
        context: evaluateActive(next, event.timestampMs, tuning, effects),
        effects,
      };
    }

    case 'CAMERA_SETTLED': {
      const next = {
        ...context,
        cameraSettled: event.settled,
        nowMs: event.timestampMs,
        ...(event.settled ? {} : { stillSinceMs: null }),
      };
      if (next.state !== 'PREWARM') {
        return { context: next, effects };
      }
      return {
        context: evaluateActive(next, event.timestampMs, tuning, effects),
        effects,
      };
    }

    case 'CAMERA_FAILED': {
      effects.push({ type: 'HAPTIC_ERROR' });
      const slept = enterSleep(context, effects, {
        clearResult: false,
        emitStop: true,
      });
      return {
        context: { ...slept, error: event.error, nowMs: event.timestampMs },
        effects,
      };
    }

    case 'CAPTURE_SUCCEEDED': {
      // A drop or timeout after the shutter means the user never saw the
      // result; do not charge the daily counter for an aborted read.
      if (context.state !== 'SCANNING') {
        return {
          context: { ...context, nowMs: event.timestampMs },
          effects,
        };
      }

      const scansUsedToday = context.scansUsedToday + 1;
      effects.push(
        {
          type: 'PERSIST_SCAN',
          dayKey: context.dayKey,
          scansUsedToday,
        },
        { type: 'STOP_CAMERA' },
        { type: 'HAPTIC_SUCCESS' },
      );
      return {
        context: {
          ...context,
          state: 'LOCKED_READ',
          scansUsedToday,
          result: event.result,
          error: null,
          cameraSettled: false,
          stillSinceMs: null,
          nowMs: event.timestampMs,
        },
        effects,
      };
    }

    case 'CAPTURE_FAILED': {
      effects.push({ type: 'HAPTIC_ERROR' });
      if (context.state !== 'SCANNING') {
        return {
          context: { ...context, error: event.error, nowMs: event.timestampMs },
          effects,
        };
      }

      if (event.error.fatal) {
        const slept = enterSleep(context, effects, {
          clearResult: true,
          emitStop: true,
        });
        return {
          context: { ...slept, error: event.error, nowMs: event.timestampMs },
          effects,
        };
      }

      const attempts = context.attemptsThisArm + 1;
      if (attempts >= tuning.maxCaptureAttempts) {
        const slept = enterSleep(context, effects, {
          clearResult: true,
          emitStop: true,
        });
        return {
          context: { ...slept, error: event.error, nowMs: event.timestampMs },
          effects,
        };
      }

      const retry = enterPrewarm(
        { ...context, attemptsThisArm: attempts },
        effects,
        event.timestampMs,
        { resetAttempts: false, clearError: false },
      );
      return {
        context: { ...retry, error: event.error },
        effects,
      };
    }

    case 'WAKE':
    case 'SCAN_AGAIN': {
      return {
        context: attemptArm(context, event.timestampMs, tuning, effects),
        effects,
      };
    }

    case 'SLEEP': {
      const slept = enterSleep(context, effects, {
        clearResult: true,
        emitStop: true,
      });
      return {
        context: { ...slept, nowMs: event.timestampMs },
        effects,
      };
    }

    case 'DISMISS_ERROR': {
      return {
        context: { ...context, error: null, nowMs: event.timestampMs },
        effects,
      };
    }

    case 'ENTITLEMENT_CHANGED': {
      return {
        context: {
          ...context,
          unlimited: event.unlimited,
          nowMs: event.timestampMs,
        },
        effects,
      };
    }

    case 'DAY_ROLLOVER': {
      return {
        context: {
          ...context,
          dayKey: event.dayKey,
          scansUsedToday: event.scansUsedToday,
          nowMs: event.timestampMs,
        },
        effects,
      };
    }

    default: {
      return { context, effects };
    }
  }
}
