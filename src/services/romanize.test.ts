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

import { romanTermSpans } from './romanize';

describe('romanTermSpans', () => {
  it('finds romanized dish names inside a real translation', () => {
    const source = [
      '동대문 엽기떡볶이',
      '떡볶이 3,500원',
      '순대 4,500원',
      '모둠튀김 6,000원',
      '김밥 2,500원',
      '어묵 1,000원',
      '배달의민족 주문 가능',
    ].join('\n');
    const terms = [
      ...source.split('\n').filter((line) => line.split(/\s+/).length <= 4),
      ...source.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4),
    ];
    const translation =
      'my name yeopgi\ntteokbokki deokbokki 3,500 won Sundae 4,500 won 6,000 fish cake gimbap 2,500 won 1/2,000 won';
    const words = romanTermSpans(translation, terms).map((span) => span.word);
    expect(words).toEqual(
      expect.arrayContaining(['yeopgi', 'tteokbokki', 'deokbokki', 'Sundae', 'gimbap']),
    );
  });
});
