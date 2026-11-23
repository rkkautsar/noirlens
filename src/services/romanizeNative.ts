import { Platform } from 'react-native';

import vision from '../../modules/native-vision-translator';
import { romanize } from './romanize';

/**
 * Prefer the platform's ICU transliteration (Han to pinyin, Thai, Arabic,
 * Cyrillic, kana) and fall back to the bundled tables on web/Android.
 */
export async function romanizeNative(text: string): Promise<string> {
  if (Platform.OS === 'ios') {
    try {
      const out = await vision.romanize(text);
      if (out && out !== text) {
        return out;
      }
    } catch {
      // fall through to the tables
    }
  }
  return romanize(text);
}
