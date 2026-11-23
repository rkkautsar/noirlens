import { useSyncExternalStore } from 'react';

import vision from '../../modules/native-vision-translator';
import {
  CAPTURES_KEY,
  addCapture,
  filesOf,
  markReviewed,
  parseCaptures,
  removeCapture,
  serializeCaptures,
  unreviewedCount,
  updateCapture,
  type CaptureRecord,
} from './captureModel';
import { readMeta, writeMeta } from './db';

export interface CapturesSnapshot {
  records: readonly CaptureRecord[];
  unreviewed: number;
  loaded: boolean;
  directory: string;
}

const INITIAL: CapturesSnapshot = {
  records: [],
  unreviewed: 0,
  loaded: false,
  directory: '',
};

class CaptureRepository {
  private snapshot: CapturesSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private loadPromise: Promise<void> | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CapturesSnapshot => this.snapshot;

  get(id: string): CaptureRecord | undefined {
    return this.snapshot.records.find((record) => record.id === id);
  }

  records(): readonly CaptureRecord[] {
    return this.snapshot.records;
  }

  pending(): CaptureRecord[] {
    return this.snapshot.records.filter(
      (record) => record.status === 'pending' || record.status === 'processing',
    );
  }

  uriFor(name: string): string {
    if (
      name === '' ||
      name.startsWith('data:') ||
      name.startsWith('file:') ||
      name.startsWith('http')
    ) {
      return name;
    }
    return this.snapshot.directory + name;
  }

  private set(records: readonly CaptureRecord[]): void {
    this.snapshot = {
      ...this.snapshot,
      records,
      unreviewed: unreviewedCount(records),
    };
    for (const listener of this.listeners) {
      listener();
    }
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.chain.then(operation, operation);
    this.chain = run.catch(() => {});
    return run;
  }

  private async persist(records: readonly CaptureRecord[]): Promise<void> {
    await writeMeta(CAPTURES_KEY, serializeCaptures(records));
  }

  private deleteFiles(names: readonly string[]): void {
    const files = names.filter((name) => name.length > 0);
    if (files.length === 0) {
      return;
    }
    void vision.deleteCaptureFiles(files).catch(() => {});
  }

  hydrate(): Promise<void> {
    if (this.snapshot.loaded) {
      return Promise.resolve();
    }
    if (this.loadPromise === null) {
      this.loadPromise = this.serialized(async () => {
        const [raw, directory] = await Promise.all([
          readMeta(CAPTURES_KEY).catch(() => null),
          vision.capturesDirectory().catch(() => ''),
        ]);
        this.snapshot = {
          ...this.snapshot,
          records: parseCaptures(raw),
          unreviewed: unreviewedCount(parseCaptures(raw)),
          loaded: true,
          directory,
        };
        for (const listener of this.listeners) {
          listener();
        }
      }).finally(() => {
        this.loadPromise = null;
      });
    }
    return this.loadPromise;
  }

  add(record: CaptureRecord): Promise<void> {
    return this.serialized(async () => {
      const { records, evicted } = addCapture(this.snapshot.records, record);
      await this.persist(records);
      this.set(records);
      this.deleteFiles(evicted.flatMap(filesOf));
    });
  }

  patch(id: string, patch: Partial<CaptureRecord>): Promise<void> {
    return this.serialized(async () => {
      const records = updateCapture(this.snapshot.records, id, patch);
      await this.persist(records);
      this.set(records);
    });
  }

  fail(id: string, message: string): Promise<void> {
    return this.serialized(async () => {
      const current = this.snapshot.records.find((record) => record.id === id);
      if (!current) {
        return;
      }
      const records = updateCapture(this.snapshot.records, id, {
        status: 'failed',
        error: message,
        attempts: current.attempts + 1,
      });
      await this.persist(records);
      this.set(records);
    });
  }

  review(id: string): Promise<void> {
    return this.serialized(async () => {
      const records = markReviewed(this.snapshot.records, id, Date.now());
      await this.persist(records);
      this.set(records);
    });
  }

  remove(id: string): Promise<void> {
    return this.serialized(async () => {
      const target = this.snapshot.records.find((record) => record.id === id);
      const records = removeCapture(this.snapshot.records, id);
      await this.persist(records);
      this.set(records);
      if (target) {
        this.deleteFiles(filesOf(target));
      }
    });
  }

  clear(): Promise<void> {
    return this.serialized(async () => {
      const names = this.snapshot.records.flatMap(filesOf);
      await this.persist([]);
      this.set([]);
      this.deleteFiles(names);
    });
  }
}

export const captures = new CaptureRepository();

export function useCaptures(): CapturesSnapshot {
  return useSyncExternalStore(
    captures.subscribe,
    captures.getSnapshot,
    captures.getSnapshot,
  );
}
