import { describe, expect, it } from 'vitest';

import { remainingFor } from './allowance';

describe('remainingFor', () => {
  it('keeps unknown distinct from zero', () => {
    expect(remainingFor(false, null)).toBeNull();
    expect(remainingFor(false, 15)).toBe(0);
  });

  it('is null for unlimited plans', () => {
    expect(remainingFor(true, 0)).toBeNull();
  });

  it('derives the free balance', () => {
    expect(remainingFor(false, 4)).toBe(11);
  });
});
