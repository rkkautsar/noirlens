import { useSyncExternalStore } from 'react';

import vision from '../../modules/native-vision-translator';
import {
  CAPTURES_KEY,
  addCapture,
  filesOf,
  markReviewed,
  parseCaptureRecord,
  parseCaptureStore,
  removeCapture,
  serializeCapture,
  unreviewedCount,
  updateCapture,
  type CaptureRecord,
} from './captureModel';
import {
  readMeta,
  readMetaMany,
  removeMetaMany,
  writeMeta,
  writeMetaMany,
} from './db';

const CAPTURES_INDEX_KEY = 'captures.v1.index';
const CAPTURE_ROW_PREFIX = 'captures.v1.row.';

function rowKey(id: string): string {
  return CAPTURE_ROW_PREFIX + id;
}

function parseIndex(raw: string | null): {
  ids: string[] | null;
  corrupt: boolean;
} {
  if (raw === null) {
    return { ids: null, corrupt: false };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
      return { ids: null, corrupt: true };
    }
    return { ids: parsed, corrupt: false };
  } catch {
    return { ids: null, corrupt: true };
  }
}

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

  private async persistIndex(records: readonly CaptureRecord[]): Promise<void> {
    await writeMeta(
      CAPTURES_INDEX_KEY,
      JSON.stringify(records.map((record) => record.id)),
    );
  }

  private async persistRecord(record: CaptureRecord): Promise<void> {
    await writeMeta(rowKey(record.id), serializeCapture(record));
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

  private async sweepOrphans(records: readonly CaptureRecord[]): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    const files = await vision.listCaptureFiles(600).catch(() => null);
    if (!files) {
      return;
    }
    const referenced = new Set(records.flatMap(filesOf));
    const orphans = files.filter((name) => !referenced.has(name));
    if (orphans.length > 0) {
      await this.deleteFiles(orphans);
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
          const [directory, indexRaw] = await Promise.all([
            vision.capturesDirectory().catch(() => ''),
            readMeta(CAPTURES_INDEX_KEY),
          ]);
          let records: CaptureRecord[] = [];
          const parsedIndex = parseIndex(indexRaw);
          if (parsedIndex.corrupt) {
            // Fail closed: an unreadable manifest must not look like an empty
            // library, or the orphan sweep would delete every saved image.
            throw new Error('Capture index is unreadable.');
          }
          const index = parsedIndex.ids;
          if (index === null) {
            // First run after the single-blob layout (or a fresh install).
            const parsed = parseCaptureStore(await readMeta(CAPTURES_KEY));
            if (!parsed.complete) {
              // Never migrate or delete the legacy blob from a partial view.
              throw new Error('Legacy capture store is incomplete.');
            }
            records = parsed.records;
            if (records.length > 0) {
              await writeMetaMany(
                records.map((record) => [
                  rowKey(record.id),
                  serializeCapture(record),
                ]),
              );
              await this.persistIndex(records);
              await removeMetaMany([CAPTURES_KEY]);
            }
          } else {
            const rows = await readMetaMany(index.map(rowKey));
            for (const raw of rows) {
              const record = parseCaptureRecord(raw);
              if (record === null) {
                // A missing/corrupt row means the view is incomplete; keep
                // storage read-only rather than reconciling against it.
                throw new Error('A capture row is unreadable.');
              }
              records.push(record);
            }
          }
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
          if (!reconcile) {
            return;
          }
          // Startup-only sweep after the first frame. Only files older than
          // the grace window are candidates, so a capture written while this
          // runs can never be mistaken for an orphan of the record it is
          // about to add.
          void this.sweepOrphans(records);
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
        // Row first, then the manifest: a failed manifest write leaves an
        // unreferenced row, never a manifest pointing at missing data.
        await this.persistRecord(record);
        await this.persistIndex(records);
        this.set(records);
        // Retention cleanup is best effort; it must never reject the commit.
        void removeMetaMany(evicted.map((entry) => rowKey(entry.id))).catch(
          () => {},
        );
        void this.deleteFiles(evicted.flatMap(filesOf));
      }),
    );
  }

  patch(id: string, patch: Partial<CaptureRecord>): Promise<void> {
    return this.ensureAvailable().then(() =>
      this.serialized(async () => {
        const records = updateCapture(this.snapshot.records, id, patch);
        const record = records.find((entry) => entry.id === id);
        if (record) {
          await this.persistRecord(record);
        }
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
        const updated = records.find((entry) => entry.id === id);
        if (updated) {
          await this.persistRecord(updated);
        }
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
        const record = records.find((entry) => entry.id === id);
        if (record) {
          await this.persistRecord(record);
        }
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
        const record = records.find((entry) => entry.id === id);
        if (record) {
          await this.persistRecord(record);
        }
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
        const record = records.find((entry) => entry.id === id);
        if (record) {
          await this.persistRecord(record);
        }
        this.set(records);
      }),
    );
  }

  review(id: string): Promise<void> {
    return this.ensureAvailable().then(() =>
      this.serialized(async () => {
        const records = markReviewed(this.snapshot.records, id, Date.now());
        const record = records.find((entry) => entry.id === id);
        if (record) {
          await this.persistRecord(record);
        }
        this.set(records);
      }),
    );
  }

  remove(id: string): Promise<void> {
    return this.ensureAvailable().then(() =>
      this.serialized(async () => {
        const target = this.snapshot.records.find((record) => record.id === id);
        const records = removeCapture(this.snapshot.records, id);
        await this.persistIndex(records);
        this.set(records);
        void removeMetaMany([rowKey(id)]).catch(() => {});
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
        const keys = this.snapshot.records.map((record) => rowKey(record.id));
        await this.persistIndex([]);
        this.set([]);
        void removeMetaMany(keys).catch(() => {});
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
