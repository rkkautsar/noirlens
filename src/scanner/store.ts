import {
  DEFAULT_TUNING,
  createInitialContext,
  reduceScanner,
  remainingScans,
  type ScanError,
  type ScanResult,
  type ScannerContext,
  type ScannerEffect,
  type ScannerEvent,
  type ScannerState,
  type ScannerTuning,
} from './machine';

export interface ScannerSnapshot {
  state: ScannerState;
  result: ScanResult | null;
  error: ScanError | null;
  scansUsedToday: number;
  /** null means unlimited. */
  remainingToday: number | null;
  unlimited: boolean;
  hydrated: boolean;
}

export type ScannerEffectHandler = (effect: ScannerEffect) => void;

function buildSnapshot(
  context: ScannerContext,
  tuning: ScannerTuning,
): ScannerSnapshot {
  return {
    state: context.state,
    result: context.result,
    error: context.error,
    scansUsedToday: context.scansUsedToday,
    remainingToday: remainingScans(context, tuning),
    unlimited: context.unlimited,
    hydrated: context.hydrated,
  };
}

function affectsUI(previous: ScannerContext, next: ScannerContext): boolean {
  return (
    previous.state !== next.state ||
    previous.result !== next.result ||
    previous.error !== next.error ||
    previous.scansUsedToday !== next.scansUsedToday ||
    previous.unlimited !== next.unlimited ||
    previous.hydrated !== next.hydrated
  );
}

/**
 * Owns the reducer context and exposes only UI-relevant changes. Motion arrives
 * at 20 Hz, but React only re-renders when the state, result, error, counter or
 * entitlement actually changes.
 */
export class ScannerStore {
  private context: ScannerContext;
  private snapshot: ScannerSnapshot;
  private listeners = new Set<() => void>();
  private effectHandler: ScannerEffectHandler | null = null;
  private readonly tuning: ScannerTuning;

  constructor(options: {
    dayKey: string;
    scansUsedToday: number;
    unlimited: boolean;
    nowMs: number;
    tuning?: ScannerTuning;
  }) {
    this.tuning = options.tuning ?? DEFAULT_TUNING;
    this.context = createInitialContext({
      dayKey: options.dayKey,
      scansUsedToday: options.scansUsedToday,
      unlimited: options.unlimited,
      nowMs: options.nowMs,
    });
    this.snapshot = buildSnapshot(this.context, this.tuning);
  }

  setEffectHandler(handler: ScannerEffectHandler | null): void {
    this.effectHandler = handler;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ScannerSnapshot => this.snapshot;

  send(event: ScannerEvent): void {
    const previous = this.context;
    const { context, effects } = reduceScanner(previous, event, this.tuning);
    this.context = context;

    if (affectsUI(previous, context)) {
      this.snapshot = buildSnapshot(context, this.tuning);
      for (const listener of this.listeners) {
        listener();
      }
    }

    for (const effect of effects) {
      this.effectHandler?.(effect);
    }
  }
}
