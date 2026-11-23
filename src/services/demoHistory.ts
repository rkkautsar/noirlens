import type { ScanHistoryEntry } from './scanHistory';

export const DEMO_HISTORY: ScanHistoryEntry[] = [
  {
    id: 'mock-1',
    at: Date.now() - 1000 * 60 * 8,
    sourceLanguage: 'ko',
    sourceText: '금연 · 담배는 건강에 해롭습니다',
    translatedText:
      'No smoking. Cigarettes are harmful to your health and the people around you.',
    kind: 'translated',
  },
  {
    id: 'mock-2',
    at: Date.now() - 1000 * 60 * 46,
    sourceLanguage: 'ja',
    sourceText: '営業時間 10:00 - 20:00',
    translatedText: 'Business hours 10:00 - 20:00',
    kind: 'translated',
  },
  {
    id: 'mock-3',
    at: Date.now() - 1000 * 60 * 60 * 3,
    sourceLanguage: 'th',
    sourceText: 'ราคา 120 บาท',
    translatedText: 'Price 120 baht',
    kind: 'translated',
  },
];
