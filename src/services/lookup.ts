import { readMeta, writeMeta } from './db';
import { englishTermSpans } from './englishTerms';

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

export interface LookupSpan {
  start: number;
  end: number;
  text: string;
}

/**
 * Underlined lookup terms in the translated text: proper-noun groups,
 * out-of-vocabulary nouns, and non-Latin runs. Source-independent, so a
 * translated proper noun is found even when the source script was different.
 */
export function lookupSpans(result: { translatedText: string }): LookupSpan[] {
  return englishTermSpans(result.translatedText);
}

/**
 * Tappable term spans after price ranges win and overlaps resolve to the
 * first-longest span. Kept separate from lookupSpans so a shorter term hidden
 * under a priced line can survive once the priced span is removed.
 */
export function resolveTermSpans(
  terms: LookupSpan[],
  prices: Array<{ start: number; end: number }> = [],
  text?: string,
): LookupSpan[] {
  const trimmed: LookupSpan[] = [];
  for (const term of terms) {
    const overlapping = prices
      .filter((price) => term.start < price.end && term.end > price.start)
      .sort((a, b) => a.start - b.start);
    if (overlapping.length === 0) {
      trimmed.push(term);
      continue;
    }
    let cursor = term.start;
    for (const price of overlapping) {
      const end = Math.min(price.start, term.end);
      if (end > cursor) {
        trimmed.push({
          start: cursor,
          end,
          text: text ? text.slice(cursor, end).trimEnd() : term.text,
        });
      }
      cursor = Math.max(cursor, price.end);
    }
    if (cursor < term.end) {
      trimmed.push({
        start: cursor,
        end: term.end,
        text: text ? text.slice(cursor, term.end).trimEnd() : term.text,
      });
    }
  }
  const kept: LookupSpan[] = [];
  let lastEnd = 0;
  for (const term of trimmed) {
    if (term.start >= lastEnd && term.end > term.start) {
      kept.push(term);
      lastEnd = term.end;
    }
  }
  return kept;
}
