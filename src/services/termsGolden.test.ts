import { describe, expect, it } from 'vitest';

import { lookupSpans } from './lookup';
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

function overlaps(a: Occurrence, b: Occurrence): boolean {
  return a.start < b.end && a.end > b.start;
}

describe('lookup terms golden set', () => {
  it('meets the precision/recall floor on paired translations', () => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    const misses: string[] = [];

    for (const entry of TERMS_GOLDEN) {
      const spans = lookupSpans({
        sourceText: entry.blocks.join(' '),
        translatedText: entry.translatedText,
        blocks: entry.blocks.map((text) => ({ text })),
      });
      const expected = entry.expected.flatMap((term) =>
        occurrences(entry.translatedText, term),
      );
      const caseTp = expected.filter((hit) =>
        spans.some((span) => overlaps(span, hit)),
      ).length;
      const caseFp = spans.filter(
        (span) => !expected.some((hit) => overlaps(span, hit)),
      ).length;
      tp += caseTp;
      fp += caseFp;
      fn += expected.length - caseTp;
      if (caseTp !== expected.length || caseFp > 0) {
        misses.push(
          `${entry.id}: tp=${caseTp}/${expected.length} fp=${caseFp} spans=${JSON.stringify(
            spans.map((span) => span.text),
          )}`,
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
    // Keep the floor below the measured result; raise it as the detector improves.
    expect(recall).toBeGreaterThanOrEqual(0.85);
    expect(precision).toBeGreaterThanOrEqual(0.85);
    expect(f1).toBeGreaterThanOrEqual(0.85);
  });
});
