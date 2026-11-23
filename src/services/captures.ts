import { useSyncExternalStore } from 'react';

import vision from '../../modules/native-vision-translator';
import {
  CAPTURES_KEY,
  addCapture,
  filesOf,
  markReviewed,
  parseCaptureStore,
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
  /** A hydrate attempt finished (success or failure). */
  loaded: boolean;
  /** Storage read succeeded; metadata writes are safe only when true. */
  available: boolean;
  directory: string;
}

const INITIAL: CapturesSnapshot = {
  records: [],
  unreviewed: 0,
  loaded: false,
  available: false,
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

  private async deleteFiles(names: readonly string[]): Promise<void> {
    const files = names.filter((name) => name.length > 0);
    if (files.length === 0) {
      return;
    }
    try {
      await vision.deleteCaptureFiles(files);
    } catch {
      // Leftovers are reconciled on the next successful hydrate.
    }
  }

  /** Never write metadata over a store that could not be read. */
  private async ensureAvailable(): Promise<void> {
    if (!this.snapshot.available) {
      await this.hydrate();
    }
    if (!this.snapshot.available) {
      throw new Error('Capture storage is unavailable.');
    }
  }

  hydrate(options: { reconcile?: boolean } = {}): Promise<void> {
    if (this.snapshot.available) {
      return Promise.resolve();
    }
    if (this.loadPromise === null) {
      const reconcile = options.reconcile === true;
      this.loadPromise = this.serialized(async () => {
        try {
          const directory = await vision
            .capturesDirectory()
            .catch(() => '');
          const raw = await readMeta(CAPTURES_KEY);
          const { records, complete } = parseCaptureStore(raw);
          this.snapshot = {
            ...this.snapshot,
            records,
            unreviewed: unreviewedCount(records),
            loaded: true,
            available: true,
            directory,
          };
          for (const listener of this.listeners) {
            listener();
          }
          if (!reconcile || !complete) {
            return;
          }
          // Startup-only sweep. Only files older than the grace window are
          // candidates, so a capture written while this runs can never be
          // mistaken for an orphan of the record it is about to add.
          const files = await vision
            .listCaptureFiles(600)
            .catch(() => null);
          if (!files) {
            return;
          }
          const referenced = new Set(records.flatMap(filesOf));
          const orphans = files.filter((name) => !referenced.has(name));
          if (orphans.length > 0) {
            await this.deleteFiles(orphans);
          }
        } catch {
          this.snapshot = { ...this.snapshot, loaded: true, available: false };
          for (const listener of this.listeners) {
            listener();
          }
        }
      }).finally(() => {
        this.loadPromise = null;
      });
    }
    return this.loadPromise;
  }

  add(record: CaptureRecord): Promise<void> {
    return this.ensureAvailable().then(() =>
      this.serialized(async () => {
        const { records, evicted } = addCapture(this.snapshot.records, record);
        await this.persist(records);
        this.set(records);
        await this.deleteFiles(evicted.flatMap(filesOf));
      }),
    );
  }

  patch(id: string, patch: Partial<CaptureRecord>): Promise<void> {
    return this.ensureAvailable().then(() =>
      this.serialized(async () => {
        const records = updateCapture(this.snapshot.records, id, patch);
        await this.persist(records);
        this.set(records);
      }),
    );
  }

  /** Starts a re-read and returns the revision its result must match. */
  beginOcrRerun(id: string, hint: string): Promise<number | null> {
    return this.ensureAvailable().then(() =>
      this.serialized(async () => {
        const current = this.snapshot.records.find(
          (record) => record.id === id,
        );
        if (!current) {
          return null;
        }
        const revision = current.ocrRevision + 1;
        const records = updateCapture(this.snapshot.records, id, {
          hint,
          ocrRevision: revision,
          status: 'pending',
          text: '',
          language: '',
          blocks: [],
          confidence: 0,
          error: null,
          attempts: 0,
        });
        await this.persist(records);
        this.set(records);
        return revision;
      }),
    );
  }

  patchForRevision(
    id: string,
    revision: number,
    patch: Partial<CaptureRecord>,
  ): Promise<void> {
    return this.ensureAvailable().then(() =>
      this.serialized(async () => {
        const current = this.snapshot.records.find(
          (record) => record.id === id,
        );
        if (!current || current.ocrRevision !== revision) {
          return;
        }
        const records = updateCapture(this.snapshot.records, id, patch);
        await this.persist(records);
        this.set(records);
      }),
    );
  }

  failForRevision(
    id: string,
    revision: number,
    message: string,
  ): Promise<void> {
    return this.ensureAvailable().then(() =>
      this.serialized(async () => {
        const current = this.snapshot.records.find(
          (record) => record.id === id,
        );
        if (!current || current.ocrRevision !== revision) {
          return;
        }
        const records = updateCapture(this.snapshot.records, id, {
          status: 'failed',
          error: message,
          attempts: current.attempts + 1,
        });
        await this.persist(records);
        this.set(records);
      }),
    );
  }

  fail(id: string, message: string): Promise<void> {
    return this.ensureAvailable().then(() =>
      this.serialized(async () => {
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
      }),
    );
  }

  review(id: string): Promise<void> {
    return this.ensureAvailable().then(() =>
      this.serialized(async () => {
        const records = markReviewed(this.snapshot.records, id, Date.now());
        await this.persist(records);
        this.set(records);
      }),
    );
  }

  remove(id: string): Promise<void> {
    return this.ensureAvailable().then(() =>
      this.serialized(async () => {
        const target = this.snapshot.records.find((record) => record.id === id);
        const records = removeCapture(this.snapshot.records, id);
        await this.persist(records);
        this.set(records);
        if (target) {
          await this.deleteFiles(filesOf(target));
        }
      }),
    );
  }

  clear(): Promise<void> {
    return this.ensureAvailable().then(() =>
      this.serialized(async () => {
        const names = this.snapshot.records.flatMap(filesOf);
        await this.persist([]);
        this.set([]);
        await this.deleteFiles(names);
      }),
    );
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
