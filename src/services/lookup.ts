import { readMeta, writeMeta } from './db';
import { COMMON_ENGLISH, romanTermSpans } from './romanize';

export interface LookupResult {
  title: string;
  extract: string;
  url: string | null;
  image: string | null;
  source: 'duckduckgo' | 'wikipedia';
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_KEY = 'lookup.v1.lru';
const MAX_CACHE_ENTRIES = 30;

interface CacheEntry {
  query: string;
  at: number;
  value: LookupResult;
}

let cacheQueue: Promise<unknown> = Promise.resolve();

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const run = cacheQueue.then(operation, operation);
  cacheQueue = run.catch(() => {});
  return run;
}

function normalizeQuery(phrase: string): string {
  return phrase.trim().toLowerCase();
}

async function readCache(): Promise<CacheEntry[]> {
  try {
    const raw = await readMeta(CACHE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is CacheEntry => {
      if (typeof entry !== 'object' || entry === null) {
        return false;
      }
      const value = entry as Record<string, unknown>;
      return (
        typeof value.query === 'string' &&
        typeof value.at === 'number' &&
        typeof value.value === 'object' &&
        value.value !== null
      );
    });
  } catch {
    return [];
  }
}

async function cacheGet(phrase: string): Promise<LookupResult | null> {
  return serialized(async () => {
    const entries = await readCache();
    const index = entries.findIndex((entry) => entry.query === phrase);
    if (index < 0) {
      return null;
    }
    const entry = entries[index];
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.at >= CACHE_TTL_MS) {
      entries.splice(index, 1);
      await writeMeta(CACHE_KEY, JSON.stringify(entries)).catch(() => {});
      return null;
    }
    // Touch: move the hit to the front of the LRU.
    if (index > 0) {
      entries.splice(index, 1);
      entries.unshift(entry);
      await writeMeta(CACHE_KEY, JSON.stringify(entries)).catch(() => {});
    }
    return entry.value;
  });
}

async function cachePut(phrase: string, value: LookupResult): Promise<void> {
  return serialized(async () => {
    const entries = (await readCache()).filter(
      (entry) => entry.query !== phrase,
    );
    entries.unshift({ query: phrase, at: Date.now(), value });
    await writeMeta(
      CACHE_KEY,
      JSON.stringify(entries.slice(0, MAX_CACHE_ENTRIES)),
    );
  });
}

async function duckDuckGo(phrase: string): Promise<LookupResult | null> {
  const response = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(phrase)}&format=json&no_html=1&skip_disambig=1`,
  );
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as {
    AbstractText?: unknown;
    AbstractURL?: unknown;
    Heading?: unknown;
    Image?: unknown;
  };
  const extract =
    typeof payload.AbstractText === 'string' ? payload.AbstractText.trim() : '';
  if (!extract) {
    return null;
  }
  const image =
    typeof payload.Image === 'string' && payload.Image.startsWith('/')
      ? `https://duckduckgo.com${payload.Image}`
      : null;
  return {
    title: typeof payload.Heading === 'string' ? payload.Heading : phrase,
    extract,
    url: typeof payload.AbstractURL === 'string' ? payload.AbstractURL : null,
    image,
    source: 'duckduckgo',
  };
}

async function wikipedia(phrase: string): Promise<LookupResult | null> {
  const search = await fetch(
    `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(phrase)}&limit=1`,
  );
  if (!search.ok) {
    return null;
  }
  const found = (await search.json()) as { pages?: Array<{ key?: string }> };
  const key = found.pages?.[0]?.key;
  if (!key) {
    return null;
  }
  const summary = await fetch(
    `https://en.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(key)}/summary`,
  );
  if (!summary.ok) {
    return null;
  }
  const page = (await summary.json()) as {
    extract?: string;
    title?: string;
    content_urls?: { desktop?: { page?: string } };
    thumbnail?: { source?: string };
  };
  if (!page.extract) {
    return null;
  }
  return {
    title: page.title ?? key,
    extract: page.extract,
    url: page.content_urls?.desktop?.page ?? null,
    image: page.thumbnail?.source ?? null,
    source: 'wikipedia',
  };
}

export function browserSearchUrl(phrase: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(phrase)}`;
}

/** Wikipedia/DuckDuckGo summary for a phrase, cached for 30 days. */
export async function lookUp(phrase: string): Promise<LookupResult | null> {
  const query = phrase.trim();
  if (!query) {
    return null;
  }
  const normalized = normalizeQuery(query);
  const cached = await cacheGet(normalized);
  if (cached) {
    return cached;
  }

  let result: LookupResult | null = null;
  try {
    result = (await duckDuckGo(query)) ?? (await wikipedia(query));
  } catch {
    result = null;
  }
  if (result) {
    void cachePut(normalized, result).catch(() => {});
  }
  return result;
}

function normalizeTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isCjkTerm(term: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u.test(
    term,
  );
}

/** Whole-word match for Latin terms; CJK/Thai retained terms use includes. */
function containsTerm(translated: string, term: string): boolean {
  if (isCjkTerm(term)) {
    return translated.includes(term);
  }
  try {
    return new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`,
      'iu',
    ).test(translated);
  } catch {
    return translated.includes(term);
  }
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}]/u.test(value);
}

interface NormalizedText {
  text: string;
  startMap: number[];
  endMap: number[];
}

function normalizeWithMap(text: string): NormalizedText {
  let normalized = '';
  const startMap: number[] = [];
  const endMap: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const base = text[index]!
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    for (let offset = 0; offset < base.length; offset += 1) {
      normalized += base[offset];
      startMap.push(index);
      endMap.push(index + 1);
    }
  }
  return { text: normalized, startMap, endMap };
}

function normalizedSpans(
  translated: NormalizedText,
  candidates: string[],
): LookupSpan[] {
  const spans: LookupSpan[] = [];
  for (const candidate of candidates) {
    const needle = normalizeTerm(candidate);
    if (needle.length < 3) {
      continue;
    }
    let from = 0;
    for (;;) {
      const at = translated.text.indexOf(needle, from);
      if (at < 0) {
        break;
      }
      const before = translated.text[at - 1];
      const after = translated.text[at + needle.length];
      const cjk = isCjkTerm(candidate);
      if (cjk || (!isWordCharacter(before) && !isWordCharacter(after))) {
        spans.push({
          start: translated.startMap[at]!,
          end: translated.endMap[at + needle.length - 1]!,
          text: '',
        });
      }
      from = at + Math.max(1, needle.length);
    }
  }
  return spans;
}

function sourceTermCandidates(result: {
  sourceText: string;
  blocks: Array<{ text: string }>;
}): string[] {
  return [
    ...result.blocks
      .map((block) => block.text.trim())
      .filter((text) => text.length > 0 && text.split(/\s+/).length <= 4),
    ...result.sourceText
      .split(/[^\p{L}\p{N}]+/u)
      .filter(
        (word) =>
          word.length >= 2 &&
          !COMMON_ENGLISH.has(
            word.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase(),
          ),
      ),
  ];
}

/**
 * Terms in the result that were passed through rather than translated:
 * short OCR blocks whose text still appears in the translation (dish names,
 * brands), plus retained source words as a fallback. These get an inline,
 * tappable underline in the result.
 */
export function untranslatedTerms(result: {
  sourceText: string;
  translatedText: string;
  blocks: Array<{ text: string }>;
}): string[] {
  const translated = normalizeTerm(result.translatedText);
  if (!translated) {
    return [];
  }
  const terms: string[] = [];
  for (const block of result.blocks) {
    const text = block.text.trim();
    if (!text) {
      continue;
    }
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 4) {
      continue;
    }
    const enough =
      isCjkTerm(text) || normalizeTerm(text).length >= 3;
    if (enough && containsTerm(result.translatedText, text)) {
      terms.push(text);
    }
  }
  const sourceWords = result.sourceText
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4);
  for (const word of sourceWords) {
    if (
      normalizeTerm(word).length >= 4 &&
      containsTerm(result.translatedText, word)
    ) {
      terms.push(word);
    }
  }
  // Longest first so "Bánh mì" wins over "Bánh".
  const unique = Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
  return unique.filter(
    (term, index) =>
      !unique
        .slice(0, index)
        .some((longer) => normalizeTerm(longer).includes(normalizeTerm(term))),
  );
}

export interface LookupSpan {
  start: number;
  end: number;
  text: string;
}

/**
 * Underlined lookup terms in the translated text: retained source blocks and
 * words, romanized proper nouns, and capitalized name pairs. Overlaps resolve
 * to the longest span.
 */
export function lookupSpans(result: {
  sourceText: string;
  translatedText: string;
  blocks: Array<{ text: string }>;
}): LookupSpan[] {
  const text = result.translatedText;
  if (!text) {
    return [];
  }
  const spans: LookupSpan[] = [];
  const pattern = termPattern(untranslatedTerms(result));
  if (pattern) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const matched = match[0];
      const end = start + matched.length;
      // The pattern is unbounded; drop matches inside a larger word unless the
      // term is CJK/Thai (no word separators).
      if (
        !isCjkTerm(matched) &&
        (isWordCharacter(text[start - 1]) || isWordCharacter(text[end]))
      ) {
        continue;
      }
      spans.push({ start, end, text: matched });
    }
  }
  const normalized = normalizeWithMap(text);
  for (const span of normalizedSpans(
    normalized,
    sourceTermCandidates(result),
  )) {
    span.text = text.slice(span.start, span.end);
    spans.push(span);
  }
  for (const span of romanTermSpans(text, sourceTermCandidates(result))) {
    spans.push({ start: span.start, end: span.end, text: span.word });
  }
  spans.sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  return spans;
}

/**
 * Tappable term spans after price ranges win and overlaps resolve to the
 * first-longest span. Kept separate from lookupSpans so a shorter term hidden
 * under a priced line can survive once the priced span is removed.
 */
export function resolveTermSpans(
  terms: LookupSpan[],
  prices: Array<{ start: number; end: number }> = [],
): LookupSpan[] {
  const withoutPrices = terms.filter(
    (term) => !prices.some((price) => term.start < price.end && term.end > price.start),
  );
  const kept: LookupSpan[] = [];
  let lastEnd = 0;
  for (const term of withoutPrices) {
    if (term.start >= lastEnd) {
      kept.push(term);
      lastEnd = term.end;
    }
  }
  return kept;
}

export function termPattern(terms: string[]): RegExp | null {
  if (terms.length === 0) {
    return null;
  }
  return new RegExp(
    `(${terms.map(escapeRegExp).join('|')})`,
    'giu',
  );
}
