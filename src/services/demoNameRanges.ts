import { DEMO_HISTORY } from './demoHistory';
import { WEB_SEED_HISTORY } from './demoSeeds';

export const WEB_DEMO_TRANSLATION =
  'Bánh mì thịt\nBaguette with pork, pâté and pickled vegetables\n45,000 VND';

/** Built-in demo outputs audited to contain no personal names. */
const AUDITED_DEMO_TEXTS = new Set([
  WEB_DEMO_TRANSLATION,
  ...DEMO_HISTORY.map((entry) => entry.translatedText),
  ...WEB_SEED_HISTORY.map((entry) => entry.translatedText),
]);

/**
 * Web fallback for the name classifier: only the fixed, reviewed demo texts
 * are preclassified. Arbitrary text returns null (unavailable), never [].
 */
export function demoNameRanges(text: string): Array<{ start: number; end: number }> | null {
  return AUDITED_DEMO_TEXTS.has(text) ? [] : null;
}
