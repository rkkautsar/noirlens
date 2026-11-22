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

export async function readScanHistory(): Promise<ScanHistoryEntry[]> {
  try {
    return parse(await readMeta(HISTORY_KEY));
  } catch {
    return [];
  }
}

export async function addScanHistory(
  entry: Omit<ScanHistoryEntry, 'id' | 'at'>,
): Promise<void> {
  const at = Date.now();
  const next: ScanHistoryEntry[] = [
    {
      ...entry,
      id: `${at}-${Math.random().toString(36).slice(2, 8)}`,
      at,
    },
    ...(await readScanHistory()),
  ].slice(0, MAX_ENTRIES);
  await writeMeta(HISTORY_KEY, JSON.stringify(next));
}

export async function clearScanHistory(): Promise<void> {
  await writeMeta(HISTORY_KEY, '[]');
}
