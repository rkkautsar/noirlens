import type { ScanHistoryEntry } from './scanHistory';

export const WEB_SEED_HISTORY: ScanHistoryEntry[] = [
  {
    id: 'web-mock-1',
    at: Date.now() - 60 * 60 * 1000,
    sourceLanguage: 'vi',
    sourceText: 'Bánh mì thịt — 45.000đ',
    translatedText:
      'Bánh mì thịt\nBaguette with pork, pâté and pickled vegetables\n45,000 VND',
    kind: 'translated',
  },
  {
    id: 'web-mock-2',
    at: Date.now() - 3 * 60 * 60 * 1000,
    sourceLanguage: 'ko',
    sourceText: '금연 · 담배는 건강에 해롭습니다',
    translatedText: 'No smoking. Cigarettes are harmful to your health.',
    kind: 'translated',
  },
  {
    id: 'web-mock-3',
    at: Date.now() - 26 * 60 * 60 * 1000,
    sourceLanguage: 'ja',
    sourceText: '本日のおすすめ — 980円',
    translatedText: "Today's recommendation — 980 yen",
    kind: 'translated',
  },
];
