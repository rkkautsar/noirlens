// Common English vocabulary loader. The dictionary lives in
// assets/common-words.txt and is read on demand; see commonWordsCore.ts for the
// index format and licensing notice.

import { Asset } from 'expo-asset';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { loadCommonWordsFromText } from './commonWordsCore';

export {
  areCommonWordsReady,
  commonWordCount,
  isCommonWord,
  loadCommonWordsFromText,
} from './commonWordsCore';

const WORD_ASSET = require('../../assets/common-words.txt') as number;

let loadPromise: Promise<void> | null = null;

/** Read and index the bundled vocabulary once. */
export function loadCommonWords(): Promise<void> {
  if (loadPromise !== null) {
    return loadPromise;
  }
  loadPromise = (async () => {
    const [asset] = await Asset.loadAsync(WORD_ASSET);
    const uri = asset?.localUri ?? asset?.uri;
    if (!uri) {
      throw new Error('The English vocabulary asset is unavailable.');
    }
    let text: string;
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error('The English vocabulary asset could not be fetched.');
      }
      text = await response.text();
    } else {
      text = await readAsStringAsync(uri);
    }
    if (text.trim().length === 0) {
      throw new Error('The English vocabulary asset is empty.');
    }
    loadCommonWordsFromText(text);
  })().catch((error: unknown) => {
    loadPromise = null;
    throw error;
  });
  return loadPromise;
}
