import { useSyncExternalStore } from 'react';

import { TRAVELER_LANGUAGES } from '@/constants/languages';
import { readMeta, writeMeta } from './db';

const SOURCE_LANGUAGE_KEY = 'settings.sourceLanguage';
const VALID_CODES = new Set([
  'auto',
  ...TRAVELER_LANGUAGES.map((language) => language.code),
]);

export interface SourceLanguageSnapshot {
  code: string;
  loaded: boolean;
}

const INITIAL: SourceLanguageSnapshot = { code: 'auto', loaded: false };

class SourceLanguageManager {
  private snapshot: SourceLanguageSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private loadPromise: Promise<void> | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SourceLanguageSnapshot => this.snapshot;

  current(): string {
    return this.snapshot.code;
  }

  private emit(next: SourceLanguageSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private selectionVersion = 0;

  async hydrate(): Promise<void> {
    if (this.snapshot.loaded) {
      return;
    }
    if (this.loadPromise === null) {
      this.loadPromise = this.load().finally(() => {
        this.loadPromise = null;
      });
    }
    return this.loadPromise;
  }

  private async load(): Promise<void> {
    const version = this.selectionVersion;
    try {
      const stored = await readMeta(SOURCE_LANGUAGE_KEY);
      if (this.selectionVersion !== version) {
        return;
      }
      const code = stored !== null && VALID_CODES.has(stored) ? stored : 'auto';
      this.emit({ code, loaded: true });
    } catch {
      this.emit({ ...INITIAL, loaded: true });
    }
  }

  async set(code: string): Promise<void> {
    this.selectionVersion += 1;
    const next = VALID_CODES.has(code) ? code : 'auto';
    this.emit({ code: next, loaded: true });
    try {
      await writeMeta(SOURCE_LANGUAGE_KEY, next);
    } catch {
      // The selection still applies for this session.
    }
  }
}

export const sourceLanguage = new SourceLanguageManager();

export function useSourceLanguage(): SourceLanguageSnapshot {
  return useSyncExternalStore(
    sourceLanguage.subscribe,
    sourceLanguage.getSnapshot,
    sourceLanguage.getSnapshot,
  );
}
