import { Platform } from 'react-native';

import vision from '../../modules/native-vision-translator';
import { romanize } from './romanize';

/**
 * Prefer the platform's ICU transliteration (Han to pinyin, Thai, Arabic,
 * Cyrillic, kana) and fall back to the bundled tables on web/Android.
 */
export async function romanizeNative(
  text: string,
  language = '',
): Promise<string> {
  // The bundled tables are deterministic and read better for Hangul (RR),
  // Cyrillic, Arabic and kana; ICU is only needed for Han and Thai.
  const table = romanize(text);
  if (table !== text) {
    return table;
  }
  if (Platform.OS === 'ios') {
    try {
      const out = await vision.romanize(text, language);
      if (out && out !== text) {
        return out;
      }
    } catch {
      // fall through
    }
  }
  return text;
}
