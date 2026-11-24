import { describe, expect, it } from 'vitest';

import { detectPrices } from './currency';
import { lookupSpans, resolveTermSpans } from './lookup';
import { isCommonWord } from './commonWords';
import { demoNameRanges, WEB_DEMO_TRANSLATION } from './demoNameRanges';
import { resolvedNameRanges } from './nameRanges';
import { TERMS_GOLDEN } from './termsGolden';

interface Occurrence {
  start: number;
  end: number;
}

function occurrences(text: string, term: string): Occurrence[] {
  const found: Occurrence[] = [];
  let from = 0;
  for (;;) {
    const index = text.indexOf(term, from);
    if (index < 0) {
      return found;
    }
    found.push({ start: index, end: index + term.length });
    from = index + Math.max(1, term.length);
  }
}

describe('lookup term boundaries', () => {
  const exact = (translatedText: string) =>
    resolveTermSpans(lookupSpans({ translatedText }));

  it('preclassifies only reviewed demo text on web', () => {
    expect(demoNameRanges(WEB_DEMO_TRANSLATION)).toEqual([]);
    expect(demoNameRanges('We met Alice at the cafe.')).toBeNull();
  });

  it('only uses name ranges resolved for the same text', () => {
    const ranges = [{ start: 0, end: 5 }];
    expect(resolvedNameRanges(null, 'Alice')).toBeNull();
    expect(resolvedNameRanges({ text: 'Bob', ranges }, 'Alice')).toBeNull();
    expect(resolvedNameRanges({ text: 'Alice', ranges }, 'Alice')).toBe(ranges);
    expect(resolvedNameRanges({ text: 'Alice', ranges: [] }, 'Alice')).toEqual([]);
    expect(resolvedNameRanges({ text: 'Alice', ranges: null }, 'Alice')).toBeNull();
  });

  it('keeps a dish after an excluded name in the same run', () => {
    const text = "We ordered Alice's nigiri.";
    const at = text.indexOf('Alice');
    const spans = lookupSpans({ translatedText: text }, [
      { start: at, end: at + 'Alice'.length },
    ]);
    expect(spans.map((span) => span.text)).toContain('nigiri');
  });

  it('does not join through a connector into an excluded name', () => {
    const text = 'We ordered Nigiri de Alice.';
    const at = text.indexOf('Alice');
    const spans = lookupSpans({ translatedText: text }, [
      { start: at, end: at + 'Alice'.length },
    ]);
    expect(spans.map((span) => span.text)).toEqual(['Nigiri']);
  });

  it('does not leave a dangling out-of-vocabulary connector', () => {
    for (const connector of ['ibn', 'Ibn', 'von', 'Von']) {
      const text = `We ordered Nigiri ${connector} Alice.`;
      const at = text.indexOf('Alice');
      const spans = lookupSpans({ translatedText: text }, [
        { start: at, end: at + 'Alice'.length },
      ]);
      expect(spans.map((span) => span.text)).toEqual(['Nigiri']);
    }
  });

  it('drops personal names in the excluded ranges', () => {
    const text = 'We met Alice at the cafe.';
    expect(exact(text).map((span) => span.text)).toContain('Alice');
    const at = text.indexOf('Alice');
    const spans = resolveTermSpans(
      lookupSpans({ translatedText: text }, [{ start: at, end: at + 'Alice'.length }]),
    );
    expect(spans.map((span) => span.text)).not.toContain('Alice');
  });

  it('finds translated names and unusual nouns without the source', () => {
    const text =
      'Yesterday I went to Don Quijote and bought some nigiri for dinner.';
    const spans = exact(text);
    expect(spans.map((span) => span.text)).toEqual([
      'Don Quijote',
      'nigiri',
    ]);
    expect(spans[0]?.start).toBe(text.indexOf('Don Quijote'));
    expect(spans[0]?.end).toBe(
      text.indexOf('Don Quijote') + 'Don Quijote'.length,
    );
    expect(spans[1]?.start).toBe(text.indexOf('nigiri'));
  });

  it('finds romanized proper nouns in the English text', () => {
    const text =
      'At midnight we joined the queue at Ichiran in Shinjuku for a bowl.';
    expect(exact(text).map((span) => span.text)).toEqual([
      'Ichiran',
      'Shinjuku',
    ]);
  });

  it('keeps proper nouns whole when they contain another name', () => {
    const text = "A booth near Sony opened SonyCorp's new store.";
    expect(exact(text).map((span) => span.text)).toEqual([
      'Sony',
      "SonyCorp's",
    ]);
  });

  it('folds curly apostrophes for words', () => {
    expect(exact('Please don’t touch the door.').map((span) => span.text)).toEqual([]);
    expect(exact("Please don't touch the door.").map((span) => span.text)).toEqual([]);
  });

  it('does not join names across a sentence break', () => {
    expect(exact('Coffee is served hot.').map((span) => span.text)).toEqual([]);
    expect(exact('Fresh fruit is available.').map((span) => span.text)).toEqual([]);
    expect(exact('We met Jo. Alice left.').map((span) => span.text)).toEqual([
      'Jo',
    ]);
    const rio = exact('We flew to Rio. Madrid was next.');
    expect(rio.map((span) => span.text)).toEqual(['Rio']);
    expect(rio.every((span) => !span.text.includes('. '))).toBe(true);
  });

  it('joins a recognized abbreviation', () => {
    expect(exact('Jl. Malioboro is crowded.').map((span) => span.text)).toContain(
      'Jl. Malioboro',
    );
  });

  it('ignores ordinary title-cased signage', () => {
    expect(exact('Fresh Fruit')).toEqual([]);
    expect(exact('Opening Hours')).toEqual([]);
    expect(exact('OPEN DAILY')).toEqual([]);
    for (const sign of ['Exit', 'Entrance', 'Closed', 'Parking', 'Restrooms']) {
      expect(exact(sign), sign).toEqual([]);
    }
  });

  it('keeps a dish when a price follows', () => {
    const cases: Array<{ text: string; term: string }> = [
      { text: 'Gimbap KRW 2,500', term: 'Gimbap' },
      { text: 'Bindaedae Tteok 3,500 Won', term: 'Bindaedae Tteok' },
      { text: 'Bindaedae Tteok ₩3,500', term: 'Bindaedae Tteok' },
    ];
    for (const entry of cases) {
      const spans = resolveTermSpans(
        lookupSpans({ translatedText: entry.text }),
        detectPrices(entry.text, 'ko'),
        entry.text,
      );
      const hit = spans.find((span) => span.text === entry.term);
      expect(hit, entry.text).toBeDefined();
      expect(hit?.start).toBe(entry.text.indexOf(entry.term));
      expect(hit?.end).toBe(
        entry.text.indexOf(entry.term) + entry.term.length,
      );
    }
  });

  it('flags a lowercase loanword mid-sentence', () => {
    const text = 'A bowl of phở costs forty thousand dong.';
    expect(exact(text).map((span) => span.text)).toEqual(['phở']);
  });
});

describe('lookup terms golden set', () => {
  it('meets the exact-term precision/recall floor on paired translations', () => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    const misses: string[] = [];

    for (const entry of TERMS_GOLDEN) {
      const priceRanges = (entry.prices ?? []).flatMap((term) =>
        occurrences(entry.translatedText, term),
      );
      const spans = resolveTermSpans(
        lookupSpans({ translatedText: entry.translatedText }),
        priceRanges,
        entry.translatedText,
      );
      const rawTerms = spans.map((span) => span.text.trim());
      const predicted = new Set(rawTerms.map((term) => term.toLowerCase()));
      const expected = new Set(
        entry.expected.map((term) => term.trim().toLowerCase()),
      );
      let caseTp = 0;
      for (const term of expected) {
        if (predicted.has(term)) {
          caseTp += 1;
        } else {
          fn += 1;
          misses.push(`${entry.id}: missing ${term}`);
        }
      }
      // Proper nouns are allowed extras: capitalized spans are legitimate
      // tappable names. Only lowercase out-of-vocabulary spans count against
      // precision.
      for (const raw of rawTerms) {
        const term = raw.toLowerCase();
        const naturalized = isCommonWord(
          term.normalize('NFD').replace(/\p{M}/gu, ''),
        );
        if (raw === term && !expected.has(term) && !naturalized) {
          fp += 1;
          misses.push(`${entry.id}: lowercase extra ${term}`);
        }
      }
      tp += caseTp;
    }

    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 =
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall);

    if (process.env.TERMS_GOLDEN_VERBOSE) {
      console.log(
        JSON.stringify({ tp, fp, fn, precision, recall, f1, misses }, null, 2),
      );
    }
    expect(recall).toBeGreaterThanOrEqual(0.9);
    expect(precision).toBeGreaterThanOrEqual(0.9);
    expect(f1).toBeGreaterThanOrEqual(0.9);
  });
});
