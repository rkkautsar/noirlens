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

export interface RomanSpan {
  start: number;
  end: number;
  word: string;
}

/**
 * Latin words in `text` that plausibly romanize one of the source terms.
 * The translator often splits or lightly mangles the transliteration, so a
 * long shared prefix or suffix also counts.
 */
export function romanTermSpans(
  text: string,
  sourceTerms: string[],
): RomanSpan[] {
  const romans = sourceTerms
    .map((term) => romanize(term).toLowerCase())
    .filter((roman) => roman.length >= 4);
  if (romans.length === 0) {
    return [];
  }
  const spans: RomanSpan[] = [];
  for (const match of text.matchAll(/[A-Za-z]+/g)) {
    const word = match[0];
    if (word.length < 4) {
      continue;
    }
    const lower = word.toLowerCase();
    const hit = romans.some(
      (roman) =>
        roman.includes(lower) ||
        lower.includes(roman) ||
        (lower.length >= 6 &&
          (roman.includes(lower.slice(-6)) || roman.includes(lower.slice(0, 6)))),
    );
    if (hit) {
      const start = match.index ?? 0;
      spans.push({ start, end: start + word.length, word });
    }
  }
  return spans;
}
