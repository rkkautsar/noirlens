import { Platform } from 'react-native';

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

const WEB_MOCK_HISTORY: ScanHistoryEntry[] = [
  {
    id: 'web-mock-1',
    at: Date.now() - 60 * 60 * 1000,
    sourceLanguage: 'vi',
    sourceText: 'Bánh mì thịt — 45.000đ',
    translatedText:
      'Bánh mì thịt is a Vietnamese sandwich with pork, pâté and pickled vegetables.',
    kind: 'translated',
  },
  {
    id: 'web-mock-2',
    at: Date.now() - 3 * 60 * 60 * 1000,
    sourceLanguage: 'ko',
    sourceText: '금연 · 담배는 건강에 해롭습니다',
    translatedText: 'No smoking. Cigarettes are harmful to your health.',
    kind: 'translated',
  },
  {
    id: 'web-mock-3',
    at: Date.now() - 26 * 60 * 60 * 1000,
    sourceLanguage: 'ja',
    sourceText: '本日のおすすめ — 980円',
    translatedText: "Today's recommendation — 980 yen",
    kind: 'translated',
  },
];

export async function readScanHistory(): Promise<ScanHistoryEntry[]> {
  try {
    const entries = parse(await readMeta(HISTORY_KEY));
    if (
      entries.length === 0 &&
      Platform.OS === 'web' &&
      process.env.EXPO_PUBLIC_DEMO !== '0'
    ) {
      return WEB_MOCK_HISTORY;
    }
    return entries;
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
