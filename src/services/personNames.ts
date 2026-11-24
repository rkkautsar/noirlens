import vision from '../../modules/native-vision-translator';

import type { NameRange } from './nameRanges';

/**
 * Personal-name ranges from the platform tagger. `null` means the classifier
 * is unavailable (web or failure), distinct from a successful empty result.
 */
export async function personalNameRanges(
  text: string,
): Promise<NameRange[] | null> {
  if (!text) {
    return [];
  }
  try {
    return await vision.personalNameRanges(text);
  } catch {
    return null;
  }
}
