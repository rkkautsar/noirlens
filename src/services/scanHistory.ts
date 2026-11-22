import { readMeta, writeMeta } from './db';

const HISTORY_KEY = 'scans.history';
const MAX_ENTRIES = 50;

export interface ScanHistoryEntry {
  id: string;
  at: number;
  sourceLanguage: string;
  sourceText: string;
  translatedText: string;
  kind: 'translated' | 'english';
}

function parse(raw: string | null): ScanHistoryEntry[] {
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is ScanHistoryEntry => {
      if (typeof entry !== 'object' || entry === null) {
        return false;
      }
      const value = entry as Record<string, unknown>;
      return (
        typeof value.id === 'string' &&
        typeof value.at === 'number' &&
        typeof value.sourceLanguage === 'string' &&
        typeof value.sourceText === 'string' &&
        typeof value.translatedText === 'string' &&
        (value.kind === 'translated' || value.kind === 'english')
      );
    });
  } catch {
    return [];
  }
}

let writeQueue: Promise<unknown> = Promise.resolve();

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(operation, operation);
  writeQueue = run.catch(() => {});
  return run;
}

export async function readScanHistory(): Promise<ScanHistoryEntry[]> {
  try {
    return parse(await readMeta(HISTORY_KEY));
  } catch {
    return [];
  }
}

export function addScanHistory(
  entry: Omit<ScanHistoryEntry, 'id' | 'at'>,
): Promise<void> {
  return serialized(async () => {
    const at = Date.now();
    // Read raw so a failed read rejects instead of overwriting history.
    const existing = parse(await readMeta(HISTORY_KEY));
    const next: ScanHistoryEntry[] = [
      {
        ...entry,
        id: `${at}-${Math.random().toString(36).slice(2, 8)}`,
        at,
      },
      ...existing,
    ].slice(0, MAX_ENTRIES);
    await writeMeta(HISTORY_KEY, JSON.stringify(next));
  });
}

export function clearScanHistory(): Promise<void> {
  return serialized(async () => {
    await writeMeta(HISTORY_KEY, '[]');
  });
}
