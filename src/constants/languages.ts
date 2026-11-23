export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

export const TRAVELER_LANGUAGES: LanguageOption[] = [
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
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
  nl: 'DUTCH',
  pl: 'POLISH',
  tr: 'TURKISH',
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
  it: 'IT',
  pt: 'PT',
  nl: 'NL',
  pl: 'PL',
  ru: 'RU',
  ar: 'AR',
  tr: 'TR',
  'zh-Hant': 'ZH-T',
};

export function languageShortLabel(code: string): string {
  return SHORT_LABELS[code] ?? code.toUpperCase();
}

export function isEnglishLanguageCode(code: string): boolean {
  return code === 'und' || code === 'en' || code.startsWith('en-');
}
