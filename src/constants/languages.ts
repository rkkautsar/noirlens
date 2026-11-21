export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

export const TRAVELER_LANGUAGES: LanguageOption[] = [
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
];

const LABELS: Record<string, string> = {
  en: 'ENGLISH',
  ja: 'JAPANESE',
  ko: 'KOREAN',
  'zh-Hans': 'CHINESE (SIMPLIFIED)',
  'zh-Hant': 'CHINESE (TRADITIONAL)',
  es: 'SPANISH',
  fr: 'FRENCH',
  de: 'GERMAN',
  th: 'THAI',
  vi: 'VIETNAMESE',
  id: 'INDONESIAN',
  pt: 'PORTUGUESE',
  it: 'ITALIAN',
  ru: 'RUSSIAN',
  ar: 'ARABIC',
  und: 'UNKNOWN',
};

export function languageLabel(code: string): string {
  return LABELS[code] ?? code.toUpperCase();
}

const SHORT_LABELS: Record<string, string> = {
  auto: 'AUTO',
  ja: 'JA',
  ko: 'KO',
  'zh-Hans': 'ZH',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  th: 'TH',
  vi: 'VI',
  id: 'ID',
};

export function languageShortLabel(code: string): string {
  return SHORT_LABELS[code] ?? code.toUpperCase();
}

export function isEnglishLanguageCode(code: string): boolean {
  return code === 'und' || code === 'en' || code.startsWith('en-');
}
