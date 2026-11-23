import { describe, expect, it } from 'vitest';

import { showFontSize } from './showText';

describe('showFontSize', () => {
  const width = 390;
  const height = 844;

  it('shrinks as the translation grows', () => {
    const sizes = [20, 100, 200, 600].map((length) =>
      showFontSize(length, width, height),
    );
    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index]!).toBeLessThanOrEqual(sizes[index - 1]!);
    }
  });

  it('never drops below the readable minimum', () => {
    expect(showFontSize(100000, 200, 300)).toBeGreaterThanOrEqual(20);
  });

  it('keeps short text large on a phone viewport', () => {
    expect(showFontSize(12, width, height)).toBeGreaterThan(40);
  });
});
