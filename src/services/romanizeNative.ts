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
  // The bundled tables read better for Hangul (RR), Cyrillic, Arabic and
  // kana. Han and Thai need ICU; a mixed text is handled by ICU as a whole.
  const needsICU = /[\u0E00-\u0E7F\u4E00-\u9FFF\u3400-\u4DBF]/.test(text);
  if (needsICU && Platform.OS === 'ios') {
    try {
      const out = await vision.romanize(text, language);
      if (out && out !== text) {
        return out;
      }
    } catch {
      // fall through to the tables
    }
  }
  return romanize(text);
}
