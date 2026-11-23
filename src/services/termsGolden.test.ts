import { describe, expect, it } from 'vitest';

import { lookupSpans, resolveTermSpans } from './lookup';
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
  const exact = (
    blocks: string[],
    translatedText: string,
  ) =>
    resolveTermSpans(
      lookupSpans({
        sourceText: blocks.join(' '),
        translatedText,
        blocks: blocks.map((text) => ({ text })),
      }),
    );

  it('keeps standalone terms out of larger words and returns exact offsets', () => {
    const cases = [
      { blocks: ['Sony'], translatedText: "A booth near Sony opened SonyCorp's new store.", term: 'Sony' },
      { blocks: ['Acme'], translatedText: 'Acme Éditions sells AcmeÉditions.', term: 'Acme' },
      { blocks: ['Lima'], translatedText: 'Lima is not Limaçon.', term: 'Lima' },
    ];
    for (const entry of cases) {
      const hits = exact(entry.blocks, entry.translatedText).filter(
        (span) => span.text.toLowerCase() === entry.term.toLowerCase(),
      );
      expect(hits, entry.translatedText).toHaveLength(1);
      const at = entry.translatedText.toLowerCase().indexOf(entry.term.toLowerCase());
      expect(hits[0]?.start).toBe(at);
      expect(hits[0]?.end).toBe(at + entry.term.length);
    }
  });

  it('keeps offsets aligned after a supplementary character', () => {
    const translatedText = '🙂 Cafe Central is open.';
    const span = exact(['Café Central'], translatedText).find(
      (entry) => entry.text === 'Cafe Central',
    );
    expect(span).toBeDefined();
    expect(span?.start).toBe(translatedText.indexOf('Cafe Central'));
    expect(span?.end).toBe(
      translatedText.indexOf('Cafe Central') + 'Cafe Central'.length,
    );
  });

  it('covers a decomposed accent in the tappable range', () => {
    const translatedText = 'We ate at Cafe\u0301 Central.';
    const span = exact(['Café Central'], translatedText).find((entry) =>
      entry.text.startsWith('Cafe'),
    );
    expect(span?.text).toBe('Cafe\u0301 Central');
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
        lookupSpans({
          sourceText: entry.blocks.join(' '),
          translatedText: entry.translatedText,
          blocks: entry.blocks.map((text) => ({ text })),
        }),
        priceRanges,
      );
      const predicted = new Set(
        spans.map((span) => span.text.trim().toLowerCase()),
      );
      const expected = new Set(
        entry.expected.map((term) => term.trim().toLowerCase()),
      );
      let caseTp = 0;
      let caseFp = 0;
      let caseFn = 0;
      for (const term of expected) {
        if (predicted.has(term)) {
          caseTp += 1;
        } else {
          caseFn += 1;
        }
      }
      for (const term of predicted) {
        if (!expected.has(term)) {
          caseFp += 1;
        }
      }
      tp += caseTp;
      fp += caseFp;
      fn += caseFn;
      if (caseTp !== expected.size || caseFp > 0) {
        misses.push(
          `${entry.id}: tp=${caseTp}/${expected.size} fp=${caseFp} predicted=${JSON.stringify([
            ...predicted,
          ])}`,
        );
      }
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
