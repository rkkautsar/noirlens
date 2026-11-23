import { describe, expect, it } from 'vitest';

import {
  MAX_CAPTURES,
  addCapture,
  markReviewed,
  parseCaptures,
  pendingCaptures,
  removeCapture,
  serializeCaptures,
  unreviewedCount,
  updateCapture,
  type CaptureRecord,
} from './captureModel';

function record(id: string, overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    at: Number(id.replace(/\D/g, '')) || 1,
    image: `${id}.jpg`,
    thumb: `${id}-thumb.jpg`,
    width: 720,
    height: 1280,
    status: 'pending',
    hint: 'ja',
    language: '',
    text: '',
    blocks: [],
    confidence: 0,
    reviewedAt: null,
    error: null,
    attempts: 0,
    ...overrides,
  };
}

describe('capture model', () => {
  it('round-trips valid records', () => {
    const records = [record('1'), record('2')];
    expect(parseCaptures(serializeCaptures(records))).toEqual(records);
  });

  it('drops malformed records instead of throwing', () => {
    const raw = JSON.stringify([
      { id: 'ok', at: 1, image: 'a', thumb: 'b', width: 1, height: 1, status: 'pending', hint: '', language: '', text: '', blocks: [], confidence: 0, reviewedAt: null, error: null, attempts: 0 },
      { id: 'bad', status: 'weird' },
      null,
      'nope',
    ]);
    expect(parseCaptures(raw).map((entry) => entry.id)).toEqual(['ok']);
    expect(parseCaptures('{not json')).toEqual([]);
    expect(parseCaptures(null)).toEqual([]);
  });

  it('keeps newest first and evicts past the bound', () => {
    let records: CaptureRecord[] = [record('1')];
    const evicted: CaptureRecord[] = [];
    for (let index = 2; index <= MAX_CAPTURES + 5; index += 1) {
      const result = addCapture(records, record(String(index)));
      records = result.records;
      evicted.push(...result.evicted);
    }
    expect(records).toHaveLength(MAX_CAPTURES);
    expect(records[0]?.id).toBe(String(MAX_CAPTURES + 5));
    expect(evicted).toHaveLength(5);
    expect(evicted[0]?.id).toBe('1');
  });

  it('derives the unreviewed badge count', () => {
    const records = [record('1'), record('2', { reviewedAt: 10 }), record('3')];
    expect(unreviewedCount(records)).toBe(2);
    expect(unreviewedCount(markReviewed(records, '1', 20))).toBe(1);
    expect(unreviewedCount(removeCapture(records, '1'))).toBe(1);
    expect(
      unreviewedCount(removeCapture(removeCapture(records, '1'), '3')),
    ).toBe(0);
  });

  it('does not re-mark an already reviewed capture', () => {
    const reviewed = markReviewed([record('1', { reviewedAt: 10 })], '1', 99);
    expect(reviewed[0]?.reviewedAt).toBe(10);
  });

  it('updates OCR fields without changing the id', () => {
    const next = updateCapture([record('1')], '1', {
      status: 'done',
      text: '出口',
      language: 'ja',
      id: 'hacked',
    });
    expect(next[0]?.id).toBe('1');
    expect(next[0]?.status).toBe('done');
    expect(next[0]?.text).toBe('出口');
  });

  it('lists pending and processing captures for resume', () => {
    const records = [
      record('1'),
      record('2', { status: 'done' }),
      record('3', { status: 'processing' }),
      record('4', { status: 'failed' }),
    ];
    expect(pendingCaptures(records).map((entry) => entry.id)).toEqual(['1', '3']);
  });
});
