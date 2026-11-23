import { useSyncExternalStore } from 'react';

import { readMeta, writeMeta } from './db';

export type CaptureMode = 'read' | 'collect';

const KEY = 'captures.mode';

export interface CaptureModeSnapshot {
  mode: CaptureMode;
  loaded: boolean;
}

const INITIAL: CaptureModeSnapshot = { mode: 'read', loaded: false };

class CaptureModeManager {
  private snapshot: CaptureModeSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private loadPromise: Promise<void> | null = null;
  private version = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CaptureModeSnapshot => this.snapshot;

  current(): CaptureMode {
    return this.snapshot.mode;
  }

  private emit(next: CaptureModeSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  hydrate(): Promise<void> {
    if (this.snapshot.loaded) {
      return Promise.resolve();
    }
    if (this.loadPromise === null) {
      const version = this.version;
      this.loadPromise = readMeta(KEY)
        .then((stored) => {
          if (this.version !== version) {
            return;
          }
          this.emit({
            mode: stored === 'collect' ? 'collect' : 'read',
            loaded: true,
          });
        })
        .catch(() => {
          if (this.version !== version) {
            return;
          }
          this.emit({ ...INITIAL, loaded: true });
        })
        .finally(() => {
          this.loadPromise = null;
        });
    }
    return this.loadPromise;
  }

  async set(mode: CaptureMode): Promise<void> {
    this.version += 1;
    this.emit({ mode, loaded: true });
    try {
      await writeMeta(KEY, mode);
    } catch {
      // The toggle still applies for this session.
    }
  }
}

export const captureMode = new CaptureModeManager();

export function useCaptureMode(): CaptureModeSnapshot {
  return useSyncExternalStore(
    captureMode.subscribe,
    captureMode.getSnapshot,
    captureMode.getSnapshot,
  );
}
