import { isCommonWord } from './commonWords';

export interface TermSpan {
  start: number;
  end: number;
  text: string;
}

const TOKEN = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
const LATIN = /^[\p{Script=Latin}\p{M}\p{N}'’]+$/u;
const LATIN_LETTER = /\p{Script=Latin}/u;
const LETTER = /\p{L}/u;
const CONNECTOR_GAP = /^[\s'’.-]+$/u;

/** Closed-class words never highlighted on their own. */
const FUNCTION_WORDS: Record<string, true> = {
  a: true,
  an: true,
  the: true,
  and: true,
  or: true,
  but: true,
  if: true,
  then: true,
  than: true,
  so: true,
  as: true,
  at: true,
  by: true,
  for: true,
  from: true,
  in: true,
  into: true,
  of: true,
  on: true,
  onto: true,
  to: true,
  with: true,
  without: true,
  is: true,
  are: true,
  was: true,
  were: true,
  be: true,
  been: true,
  being: true,
  am: true,
  do: true,
  does: true,
  did: true,
  have: true,
  has: true,
  had: true,
  will: true,
  would: true,
  can: true,
  could: true,
  should: true,
  may: true,
  might: true,
  must: true,
  i: true,
  you: true,
  he: true,
  she: true,
  it: true,
  we: true,
  they: true,
  me: true,
  him: true,
  her: true,
  us: true,
  them: true,
  my: true,
  your: true,
  his: true,
  its: true,
  our: true,
  their: true,
  this: true,
  that: true,
  these: true,
  those: true,
  there: true,
  here: true,
  when: true,
  where: true,
  who: true,
  whom: true,
  which: true,
  what: true,
  why: true,
  how: true,
  not: true,
  no: true,
  yes: true,
  also: true,
  just: true,
  very: true,
  more: true,
  most: true,
  some: true,
  any: true,
  all: true,
  each: true,
  every: true,
  both: true,
  few: true,
  many: true,
  much: true,
  such: true,
  own: true,
  same: true,
  other: true,
  another: true,
  up: true,
  down: true,
  out: true,
  off: true,
  over: true,
  under: true,
  again: true,
  further: true,
  once: true,
  only: true,
  too: true,
  about: true,
  after: true,
  before: true,
  during: true,
  between: true,
  through: true,
  against: true,
  below: true,
  above: true,
  near: true,
  around: true,
};

/** Abbreviations whose period does not end the sentence. */
const ABBREVIATIONS: Record<string, true> = {
  mr: true,
  mrs: true,
  ms: true,
  dr: true,
  st: true,
  jl: true,
  jr: true,
  sr: true,
  ave: true,
  blvd: true,
  rd: true,
  no: true,
  inc: true,
  ltd: true,
  co: true,
  vs: true,
  etc: true,
};

/** Name particles that stay lowercase inside a proper noun. */
const CONNECTORS: Record<string, true> = {
  de: true,
  del: true,
  della: true,
  der: true,
  di: true,
  da: true,
  dos: true,
  du: true,
  des: true,
  la: true,
  le: true,
  les: true,
  van: true,
  von: true,
  of: true,
  the: true,
  al: true,
  el: true,
  bin: true,
  ibn: true,
  ter: true,
  ten: true,
  y: true,
  e: true,
};

interface Token {
  text: string;
  start: number;
  end: number;
}

function canonical(value: string): string {
  return value.replace(/’/g, "'");
}

function isFunctionWord(value: string): boolean {
  return FUNCTION_WORDS[value] === true;
}

function isConnector(value: string): boolean {
  return CONNECTORS[value] === true;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function isCapitalized(value: string): boolean {
  const first = Array.from(value)[0];
  return first !== undefined && first !== first.toLowerCase();
}

function isNumeric(value: string): boolean {
  return /^\p{N}+$/u.test(value);
}

function isLatin(value: string): boolean {
  return LATIN.test(value) && LATIN_LETTER.test(value);
}

function isNonLatin(value: string): boolean {
  return !isLatin(value) && LETTER.test(value);
}

function sentenceInitialAt(text: string, start: number): boolean {
  let index = start - 1;
  while (index >= 0 && /[ \t]/.test(text[index]!)) {
    index -= 1;
  }
  return index < 0 || /[.!?\r\n]/.test(text[index]!);
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const raw = match[0];
    const start = match.index ?? 0;
    tokens.push({ text: raw, start, end: start + raw.length });
  }
  return tokens;
}

function joinable(text: string, previous: Token, next: Token): boolean {
  const gap = text.slice(previous.end, next.start);
  if (/[!?\r\n]/.test(gap)) {
    return false;
  }
  if (gap.includes('.')) {
    const previousWord = canonical(previous.text.toLowerCase());
    const initial = Array.from(previousWord).length === 1;
    return (
      (initial || ABBREVIATIONS[previousWord] === true) &&
      CONNECTOR_GAP.test(gap)
    );
  }
  return CONNECTOR_GAP.test(gap);
}

/**
 * Tappable terms in the translated English text: proper-noun groups
 * (capitalized runs with name particles), out-of-vocabulary nouns, and
 * non-Latin runs. This is deliberately independent of the source text, so a
 * translated proper noun ("Ichiran") is found even when the source was kanji.
 */
export function englishTermSpans(
  text: string,
  excluded: Array<{ start: number; end: number }> = [],
): TermSpan[] {
  if (!text) {
    return [];
  }
  const tokens = tokenize(text);
  const spans: TermSpan[] = [];
  const isExcluded = (token: Token): boolean =>
    excluded.some(
      (range) => token.start < range.end && token.end > range.start,
    );

  const isRare = (token: Token): boolean => {
    const raw = canonical(token.text.toLowerCase());
    return (
      raw.length >= 2 &&
      !isNumeric(token.text) &&
      !isFunctionWord(raw) &&
      !isCommonWord(raw)
    );
  };

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;

    if (isExcluded(token)) {
      index += 1;
      continue;
    }

    if (isNumeric(token.text)) {
      index += 1;
      continue;
    }

    if (isNonLatin(token.text)) {
      spans.push({ start: token.start, end: token.end, text: token.text });
      index += 1;
      continue;
    }

    const normalized = normalize(token.text);
    if (
      normalized.length < 2 ||
      isFunctionWord(normalized) ||
      !LATIN_LETTER.test(token.text)
    ) {
      index += 1;
      continue;
    }

    if (isCapitalized(token.text)) {
      let last = index;
      let cursor = index + 1;
      while (cursor < tokens.length) {
        const next = tokens[cursor]!;
        if (isExcluded(next) || !joinable(text, tokens[last]!, next)) {
          break;
        }
        if (isNonLatin(next.text)) {
          break;
        }
        if (isConnector(canonical(next.text.toLowerCase())) === true) {
          if (
            cursor + 1 < tokens.length &&
            !isExcluded(tokens[cursor + 1]!) &&
            isCapitalized(tokens[cursor + 1]!.text) &&
            !isFunctionWord(canonical(tokens[cursor + 1]!.text.toLowerCase())) &&
            joinable(text, next, tokens[cursor + 1]!)
          ) {
            last = cursor + 1;
            cursor += 2;
            continue;
          }
          break;
        }
        if (isCapitalized(next.text) && !isFunctionWord(next.text.toLowerCase())) {
          last = cursor;
          cursor += 1;
          continue;
        }
        if (isRare(next)) {
          last = cursor;
          cursor += 1;
          continue;
        }
        break;
      }
      const group = tokens.slice(index, last + 1);
      const multiword = last > index;
      const sentenceInitial = sentenceInitialAt(text, token.start);
      const common = isCommonWord(canonical(token.text.toLowerCase()));
      const hasRare = group.some((entry) => isRare(entry));
      const hasConnector = group.some(
        (entry) => isConnector(canonical(entry.text.toLowerCase())) === true,
      );
      if (!multiword && isConnector(canonical(normalized)) === true) {
        index = last + 1;
        continue;
      }
      const after = tokens[last + 1];
      const followedByNumber =
        after !== undefined &&
        isNumeric(after.text) &&
        joinable(text, tokens[last]!, after);
      // Mid-sentence capitalization marks a name even for a common word
      // ("Sony"). A sentence-initial common word is ordinary only when it is
      // a known sentence opener ("Yesterday"). A standalone title-cased run of
      // ordinary words is signage ("Fresh Fruit"); mid-sentence runs and runs
      // with a name particle are names ("Cafe Central", "Le Jules Verne").
      if (
        multiword
          ? hasRare || hasConnector || followedByNumber || !sentenceInitial
          : !sentenceInitial || !common
      ) {
        const end = tokens[last]!.end;
        spans.push({
          start: token.start,
          end,
          text: text.slice(token.start, end),
        });
      }
      index = last + 1;
      continue;
    }

    if (isConnector(canonical(normalized)) === true) {
      index += 1;
      continue;
    }

    if (isRare(token)) {
      let last = index;
      let cursor = index + 1;
      while (cursor < tokens.length) {
        const next = tokens[cursor]!;
        if (
          isExcluded(next) ||
          !joinable(text, tokens[last]!, next) ||
          isConnector(canonical(next.text.toLowerCase())) === true ||
          !isRare(next) ||
          isCapitalized(next.text)
        ) {
          break;
        }
        last = cursor;
        cursor += 1;
      }
      const group = tokens.slice(index, last + 1);
      if (group.some((entry) => Array.from(entry.text).length >= 3)) {
        const end = tokens[last]!.end;
        spans.push({
          start: token.start,
          end,
          text: text.slice(token.start, end),
        });
      }
      index = last + 1;
      continue;
    }

    index += 1;
  }

  spans.sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const kept: TermSpan[] = [];
  let lastEnd = -1;
  for (const span of spans) {
    if (span.start >= lastEnd) {
      kept.push(span);
      lastEnd = span.end;
    }
  }
  return kept;
}
