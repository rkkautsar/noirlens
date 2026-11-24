// Pure front-coded vocabulary index; the asset loader lives in commonWords.ts.

const BLOCK_CACHE_LIMIT = 128;

let blocks: string[] | null = null;
let bases: string[] | null = null;
const decoded = new Map<number, string[]>();

/** True once the vocabulary asset has been read and indexed. */
export function areCommonWordsReady(): boolean {
  return blocks !== null;
}

/** Index raw front-coded block text. Exposed so tests and the loader share it. */
export function loadCommonWordsFromText(text: string): void {
  const nextBlocks = text.split('\n').filter((line) => line.length > 0);
  if (nextBlocks.length === 0) {
    throw new Error('The English vocabulary asset is empty.');
  }
  const nextBases = nextBlocks.map((block) => {
    const split = block.indexOf('|');
    return split < 0 ? block : block.slice(0, split);
  });
  for (let index = 1; index < nextBases.length; index += 1) {
    if (nextBases[index - 1]! > nextBases[index]!) {
      throw new Error('The English vocabulary asset is out of order.');
    }
  }
  blocks = nextBlocks;
  bases = nextBases;
  decoded.clear();
}

function ensureBlocks(): void {
  if (blocks === null || bases === null) {
    throw new Error('The English vocabulary is not loaded yet.');
  }
}

function decodeBlock(index: number): string[] {
  const cached = decoded.get(index);
  if (cached !== undefined) {
    return cached;
  }
  ensureBlocks();
  const block = blocks![index]!;
  const parts = block.split('|');
  const words: string[] = [parts[0]!];
  let previous = parts[0]!;
  for (let part = 1; part < parts.length; part += 1) {
    const entry = parts[part]!;
    const colon = entry.indexOf(':');
    const shared = Number(entry.slice(0, colon));
    const word = previous.slice(0, shared) + entry.slice(colon + 1);
    words.push(word);
    previous = word;
  }
  if (decoded.size >= BLOCK_CACHE_LIMIT) {
    const oldest = decoded.keys().next().value;
    if (oldest !== undefined) {
      decoded.delete(oldest);
    }
  }
  decoded.set(index, words);
  return words;
}

/** Total entries; used by tests to guard the front-coded blocks. */
export function commonWordCount(): number {
  ensureBlocks();
  let total = 0;
  for (let index = 0; index < blocks!.length; index += 1) {
    total += decodeBlock(index).length;
  }
  return total;
}

/** Exact lowercase membership; false until the asset has been loaded. */
export function isCommonWord(value: string): boolean {
  if (blocks === null || bases === null) {
    return false;
  }
  let low = 0;
  let high = bases.length - 1;
  let candidate = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (bases[middle]! <= value) {
      candidate = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (candidate < 0) {
    return false;
  }
  const words = decodeBlock(candidate);
  let left = 0;
  let right = words.length - 1;
  while (left <= right) {
    const middle = (left + right) >> 1;
    const word = words[middle]!;
    if (word === value) {
      return true;
    }
    if (word < value) {
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }
  return false;
}
