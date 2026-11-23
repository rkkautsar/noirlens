/**
 * Revised-Romanization style Hangul transliteration, used only to spot
 * romanized Korean words the translator left in the English output.
 * Approximate: final-consonant assimilation is not modelled.
 */

const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const MEDIALS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const FINALS = ['', 'k', 'kk', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'p', 'ps', 't', 'ss', 'ng', 't', 't', 'k', 't', 'p', 't'];

export function romanize(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7a3) {
      const index = code - 0xac00;
      const initial = Math.floor(index / 588);
      const medial = Math.floor((index % 588) / 28);
      const final = index % 28;
      out += (INITIALS[initial] ?? '') + (MEDIALS[medial] ?? '') + (FINALS[final] ?? '');
    } else {
      out += char;
    }
  }
  return out;
}
