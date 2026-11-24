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
    expect(romanize('3,500원')).toBe('3,500 won');
    expect(romanize('3,500won')).toBe('3,500won');
  });
});

describe('other scripts', () => {
  it('transliterates Cyrillic', () => {
    expect(romanize('россия')).toBe('rossiya');
  });
  it('transliterates Arabic consonants', () => {
    expect(romanize('مطعم')).toBe('mṭʿm');
  });
  it('romanizes kana and leaves kanji', () => {
    expect(romanize('こんにちは')).toBe('konnichiha');
    expect(romanize('きっぷ')).toBe('kippu');
    expect(romanize('いっしょ')).toBe('issho');
    expect(romanize('えっ！')).toBe('e！');
    expect(romanize('まっちゃ')).toBe('matcha');
    expect(romanize('カタカナ')).toBe('katakana');
    expect(romanize('東京')).toBe('東京');
  });
});
