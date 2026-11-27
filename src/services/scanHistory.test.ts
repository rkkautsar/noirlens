import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addScanHistory, readScanHistory } from './scanHistory';

const store = vi.hoisted(() => new Map<string, string>());

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

vi.mock('./db', () => ({
  readMeta: async (key: string) => store.get(key) ?? null,
  writeMeta: async (key: string, value: string) => {
    store.set(key, value);
  },
}));

describe('scanHistory', () => {
  beforeEach(() => {
    store.clear();
  });

  it('updates the same capture instead of adding a second row', async () => {
    await addScanHistory(
      {
        sourceLanguage: 'en',
        sourceText: 'Exit',
        translatedText: '',
        kind: 'english',
      },
      'capture-1',
    );
    await addScanHistory(
      {
        sourceLanguage: 'ja',
        sourceText: '出口',
        translatedText: 'Exit',
        kind: 'translated',
      },
      'capture-1',
    );

    const rows = await readScanHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'capture-1',
      kind: 'translated',
      translatedText: 'Exit',
    });
  });

  it('adds a new row for a different capture', async () => {
    await addScanHistory(
      { sourceLanguage: 'en', sourceText: 'A', translatedText: '', kind: 'english' },
      'capture-1',
    );
    await addScanHistory(
      { sourceLanguage: 'en', sourceText: 'B', translatedText: '', kind: 'english' },
      'capture-2',
    );

    const rows = await readScanHistory();
    expect(rows.map((row) => row.id)).toEqual(['capture-2', 'capture-1']);
  });
});
