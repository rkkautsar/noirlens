import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadCommonWordsFromText } from './src/services/commonWordsCore';

loadCommonWordsFromText(
  readFileSync(resolve(process.cwd(), 'assets/common-words.txt'), 'utf8'),
);
