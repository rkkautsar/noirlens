import { describe, expect, it } from 'vitest';

import {
  commonWordCount,
  isCommonWord,
  loadCommonWordsFromText,
} from './commonWordsCore';

describe('commonWords', () => {
  it('decodes every front-coded entry', () => {
    expect(commonWordCount()).toBe(107221);
  });

  it('rejects malformed or incomplete assets before indexing', () => {
    expect(() => loadCommonWordsFromText('<html>error</html>')).toThrow();
    expect(() => loadCommonWordsFromText('the')).toThrow();
    expect(() => loadCommonWordsFromText('the|not-a-prefix')).toThrow();
  });

  it('matches the bundled vocabulary exactly', () => {
    for (const word of ['the', "don't", 'restaurant', 'baguette', 'pate']) {
      expect(isCommonWord(word), word).toBe(true);
    }
    for (const word of ['nigiri', 'ichiran', 'quijote', 'schiacciata']) {
      expect(isCommonWord(word), word).toBe(false);
    }
  });
});
