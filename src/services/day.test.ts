import { describe, expect, it } from 'vitest';

import { localDayKey } from './day';

describe('localDayKey', () => {
  it('formats the local calendar date with zero padding', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59, 59))).toBe('2026-01-05');
    expect(localDayKey(new Date(2026, 10, 21, 0, 0, 1))).toBe('2026-11-21');
  });

  it('rolls over at local midnight, not UTC midnight', () => {
    const before = new Date(2026, 10, 21, 23, 59, 59);
    const after = new Date(2026, 10, 22, 0, 0, 0);
    expect(localDayKey(before)).toBe('2026-11-21');
    expect(localDayKey(after)).toBe('2026-11-22');
  });
});
