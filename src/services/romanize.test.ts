import { describe, expect, it } from 'vitest';

import { romanize } from './romanize';

describe('romanize', () => {
  it('transliterates Hangul dish names', () => {
    expect(romanize('떡볶이')).toBe('tteokbokki');
    expect(romanize('순대')).toBe('sundae');
    expect(romanize('김밥')).toBe('gimbap');
    expect(romanize('엽기')).toBe('yeopgi');
  });

  it('leaves non-Hangul text alone', () => {
    expect(romanize('3,500원')).toBe('3,500won');
  });
});
