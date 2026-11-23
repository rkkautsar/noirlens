export type CaptureStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface CaptureBlock {
  text: string;
  confidence: number;
  /** Normalized 0..1, top-left origin, relative to the stored image. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureRecord {
  id: string;
  at: number;
  /** Flat filenames inside the native captures directory. */
  image: string;
  thumb: string;
  width: number;
  height: number;
  status: CaptureStatus;
  /** Source language chosen at capture time; empty string means auto. */
  hint: string;
  /** Language reported by OCR once processed. */
  language: string;
  text: string;
  blocks: CaptureBlock[];
  confidence: number;
  reviewedAt: number | null;
  error: string | null;
  attempts: number;
  /** Increments on every explicit re-read; stale OCR results are dropped. */
  ocrRevision: number;
}

export const MAX_CAPTURES = 100;
export const CAPTURES_KEY = 'captures.v1';

function isBlock(value: unknown): value is CaptureBlock {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const block = value as Record<string, unknown>;
  return (
    typeof block.text === 'string' &&
    typeof block.confidence === 'number' &&
    typeof block.x === 'number' &&
    typeof block.y === 'number' &&
    typeof block.width === 'number' &&
    typeof block.height === 'number'
  );
}

type StoredRecord = Omit<CaptureRecord, 'ocrRevision'> & {
  ocrRevision?: unknown;
};

function isRecord(value: unknown): value is StoredRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const status = record.status;
  return (
    typeof record.id === 'string' &&
    typeof record.at === 'number' &&
    typeof record.image === 'string' &&
    typeof record.thumb === 'string' &&
    typeof record.width === 'number' &&
    typeof record.height === 'number' &&
    (status === 'pending' ||
      status === 'processing' ||
      status === 'done' ||
      status === 'failed') &&
    typeof record.hint === 'string' &&
    typeof record.language === 'string' &&
    typeof record.text === 'string' &&
    Array.isArray(record.blocks) &&
    record.blocks.every(isBlock) &&
    typeof record.confidence === 'number' &&
    (record.reviewedAt === null || typeof record.reviewedAt === 'number') &&
    (record.error === null || typeof record.error === 'string') &&
    typeof record.attempts === 'number'
  );
}

export function parseCaptures(raw: string | null): CaptureRecord[] {
  return parseCaptureStore(raw).records;
}

/**
 * `complete` is false when the stored JSON was malformed or rows were
 * dropped. Destructive reconciliation must not trust an incomplete view of
 * the library: a filtered row's images would look like orphans.
 */
export function parseCaptureStore(raw: string | null): {
  records: CaptureRecord[];
  complete: boolean;
} {
  if (raw === null) {
    return { records: [], complete: true };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { records: [], complete: false };
    }
    const kept = parsed.filter(isRecord);
    const records = kept
      .map((record) => ({
        ...record,
        ocrRevision:
          typeof record.ocrRevision === 'number' ? record.ocrRevision : 0,
      }))
      .slice(0, MAX_CAPTURES);
    return { records, complete: records.length === parsed.length };
  } catch {
    return { records: [], complete: false };
  }
}

export function serializeCaptures(records: readonly CaptureRecord[]): string {
  return JSON.stringify(records);
}

export function unreviewedCount(records: readonly CaptureRecord[]): number {
  return records.reduce(
    (count, record) => (record.reviewedAt === null ? count + 1 : count),
    0,
  );
}

/** Newest first; returns the records evicted by the retention bound. */
export function addCapture(
  records: readonly CaptureRecord[],
  record: CaptureRecord,
): { records: CaptureRecord[]; evicted: CaptureRecord[] } {
  const next = [record, ...records];
  const kept = next.slice(0, MAX_CAPTURES);
  return { records: kept, evicted: next.slice(MAX_CAPTURES) };
}

export function updateCapture(
  records: readonly CaptureRecord[],
  id: string,
  patch: Partial<CaptureRecord>,
): CaptureRecord[] {
  return records.map((record) =>
    record.id === id ? { ...record, ...patch, id: record.id } : record,
  );
}

export function removeCapture(
  records: readonly CaptureRecord[],
  id: string,
): CaptureRecord[] {
  return records.filter((record) => record.id !== id);
}

export function markReviewed(
  records: readonly CaptureRecord[],
  id: string,
  at: number,
): CaptureRecord[] {
  return records.map((record) =>
    record.id === id && record.reviewedAt === null
      ? { ...record, reviewedAt: at }
      : record,
  );
}

export function pendingCaptures(
  records: readonly CaptureRecord[],
): CaptureRecord[] {
  return records.filter(
    (record) => record.status === 'pending' || record.status === 'processing',
  );
}

export function filesOf(record: CaptureRecord): string[] {
  return [record.image, record.thumb];
}
