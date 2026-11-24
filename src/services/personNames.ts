import vision from '../../modules/native-vision-translator';

import type { NameRange } from './nameRanges';

/**
 * Personal-name ranges from the platform tagger. Empty on web or failure so
 * term detection still runs without exclusions.
 */
export async function personalNameRanges(
  text: string,
): Promise<NameRange[]> {
  if (!text) {
    return [];
  }
  try {
    return await vision.personalNameRanges(text);
  } catch {
    return [];
  }
}
