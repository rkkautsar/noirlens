/**
 * Deterministic, script-by-script romanization used to show a reading of the
 * source under the translation. Fidelity varies by script and that is
 * deliberate: tables for alphabets with explicit vowels are near-exact,
 * Arabic is consonant-only (short vowels are not written), and kana is
 * Hepburn while kanji is left untouched.
 */

const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const MEDIALS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const FINALS = ['', 'k', 'kk', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'p', 'ps', 't', 'ss', 'ng', 't', 't', 'k', 't', 'p', 't'];

const CYRILLIC: Record<string, string> = {
  'а': 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  'и': 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  'с': 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  'щ': 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  'і': 'i', ї: 'yi', є: 'ye', ґ: 'g',
};

const ARABIC: Record<string, string> = {
  'ا': 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'ḥ', خ: 'kh', د: 'd',
  'ذ': 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 'ṣ', ض: 'ḍ', ط: 'ṭ',
  'ظ': 'ẓ', ع: 'ʿ', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm',
  'ن': 'n', ه: 'h', و: 'w', ي: 'y', ء: 'ʾ', ة: 'h', ى: 'a', أ: 'a',
  'إ': 'i', آ: 'ā', ؤ: 'u', ئ: 'i', لا: 'la',
};

const HIRAGANA: Record<string, string> = {
  'あ': 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku',
  'け': 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  'た': 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', な: 'na', に: 'ni',
  'ぬ': 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he',
  'ほ': 'ho', ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya',
  'ゆ': 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  'わ': 'wa', を: 'o', ん: 'n', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge',
  'ご': 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', だ: 'da',
  'ぢ': 'ji', づ: 'zu', で: 'de', ど: 'do', ば: 'ba', び: 'bi', ぶ: 'bu',
  'べ': 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  'ぁ': 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo',
  'っ': '', ー: '-', '・': ' ',
};

const KATAKANA: Record<string, string> = {
  'ア': 'a', イ: 'i', ウ: 'u', エ: 'e', オ: 'o', カ: 'ka', キ: 'ki', ク: 'ku',
  'ケ': 'ke', コ: 'ko', サ: 'sa', シ: 'shi', ス: 'su', セ: 'se', ソ: 'so',
  'タ': 'ta', チ: 'chi', ツ: 'tsu', テ: 'te', ト: 'to', ナ: 'na', ニ: 'ni',
  'ヌ': 'nu', ネ: 'ne', ノ: 'no', ハ: 'ha', ヒ: 'hi', フ: 'fu', ヘ: 'he',
  'ホ': 'ho', マ: 'ma', ミ: 'mi', ム: 'mu', メ: 'me', モ: 'mo', ヤ: 'ya',
  'ユ': 'yu', ヨ: 'yo', ラ: 'ra', リ: 'ri', ル: 'ru', レ: 're', ロ: 'ro',
  'ワ': 'wa', ヲ: 'o', ン: 'n', ガ: 'ga', ギ: 'gi', グ: 'gu', ゲ: 'ge',
  'ゴ': 'go', ザ: 'za', ジ: 'ji', ズ: 'zu', ゼ: 'ze', ゾ: 'zo', ダ: 'da',
  'ヂ': 'ji', ヅ: 'zu', デ: 'de', ド: 'do', バ: 'ba', ビ: 'bi', ブ: 'bu',
  'ベ': 'be', ボ: 'bo', パ: 'pa', ピ: 'pi', プ: 'pu', ペ: 'pe', ポ: 'po',
  'ァ': 'a', ィ: 'i', ゥ: 'u', ェ: 'e', ォ: 'o', ャ: 'ya', ュ: 'yu', ョ: 'yo',
  'ッ': '', ー: '-', '・': ' ',
};

/** きゃ → kya etc. for the small yōon kana. */
const YOON: Record<string, string> = {
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
  'キャ': 'kya', 'キュ': 'kyu', 'キョ': 'kyo',
  'シャ': 'sha', 'シュ': 'shu', 'ショ': 'sho',
  'チャ': 'cha', 'チュ': 'chu', 'チョ': 'cho',
  'ニャ': 'nya', 'ニュ': 'nyu', 'ニョ': 'nyo',
  'ヒャ': 'hya', 'ヒュ': 'hyu', 'ヒョ': 'hyo',
  'ミャ': 'mya', 'ミュ': 'myu', 'ミョ': 'myo',
  'リャ': 'rya', 'リュ': 'ryu', 'リョ': 'ryo',
  'ギャ': 'gya', 'ギュ': 'gyu', 'ギョ': 'gyo',
  'ジャ': 'ja', 'ジュ': 'ju', 'ジョ': 'jo',
  'ビャ': 'bya', 'ビュ': 'byu', 'ビョ': 'byo',
  'ピャ': 'pya', 'ピュ': 'pyu', 'ピョ': 'pyo',
};


function romanizeChar(char: string, next: string): { text: string; skipNext: boolean } {
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0xac00 && code <= 0xd7a3) {
    const index = code - 0xac00;
    const initial = Math.floor(index / 588);
    const medial = Math.floor((index % 588) / 28);
    const final = index % 28;
    return {
      text: (INITIALS[initial] ?? '') + (MEDIALS[medial] ?? '') + (FINALS[final] ?? ''),
      skipNext: false,
    };
  }
  const yoon = `${char}${next}`;
  if (YOON[yoon]) {
    return { text: YOON[yoon] ?? '', skipNext: true };
  }
  const kana = HIRAGANA[char] ?? KATAKANA[char];
  if (kana !== undefined) {
    return { text: kana, skipNext: false };
  }
  const key = char.toLowerCase();
  const cyrillic = CYRILLIC[key];
  if (cyrillic !== undefined) {
    return {
      text: char === key ? cyrillic : cyrillic.replace(/^./, (c) => c.toUpperCase()),
      skipNext: false,
    };
  }
  const arabic = ARABIC[char];
  if (arabic !== undefined) {
    return { text: arabic, skipNext: false };
  }
  return { text: char, skipNext: false };
}

export function romanize(text: string): string {
  const chars = Array.from(text);
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i] ?? '';
    if (char === 'っ' || char === 'ッ') {
      const nextChar = chars[i + 1] ?? '';
      const isKana =
        HIRAGANA[nextChar] !== undefined || KATAKANA[nextChar] !== undefined;
      if (!isKana) {
        continue;
      }
      const next = romanizeChar(nextChar, chars[i + 2] ?? '').text;
      const consonant = next.startsWith('ch')
        ? 't'
        : next.startsWith('sh')
          ? 's'
          : next.startsWith('ts')
            ? 't'
            : (next.match(/^[a-z]/)?.[0] ?? '');
      out += consonant;
      continue;
    }
    const result = romanizeChar(char, chars[i + 1] ?? '');
    if (char === '원' && /\d$/.test(out)) {
      out += ' ';
    }
    out += result.text;
    if (result.skipNext) {
      i += 1;
    }
  }
  return out;
}

/** True when the text contains at least one character a table can convert. */
export function isRomanizable(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7a3) {
      return true;
    }
    if (HIRAGANA[char] !== undefined || KATAKANA[char] !== undefined) {
      return true;
    }
    if (CYRILLIC[char.toLowerCase()] !== undefined || ARABIC[char] !== undefined) {
      return true;
    }
  }
  return false;
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

