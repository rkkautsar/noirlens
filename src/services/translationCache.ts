import { getDatabase } from './db';

const CACHE_LIMIT = 500;

export async function readCachedTranslation(
  sourceHash: string,
): Promise<string | null> {
  if (sourceHash.length === 0) {
    return null;
  }
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ target_text: string }>(
    'SELECT target_text FROM translation_cache WHERE source_hash = ? LIMIT 1',
    sourceHash,
  );
  return row?.target_text ?? null;
}

export async function writeCachedTranslation(entry: {
  sourceHash: string;
  sourceText: string;
  sourceLanguage: string;
  targetText: string;
}): Promise<void> {
  if (entry.sourceHash.length === 0) {
    return;
  }

  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO translation_cache
       (source_hash, source_text, source_language, target_text, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source_hash) DO UPDATE SET
       target_text = excluded.target_text,
       source_language = excluded.source_language,
       created_at = excluded.created_at`,
    entry.sourceHash,
    entry.sourceText,
    entry.sourceLanguage,
    entry.targetText,
    Date.now(),
  );

  await db.runAsync(
    `DELETE FROM translation_cache
     WHERE source_hash NOT IN (
       SELECT source_hash FROM translation_cache
       ORDER BY created_at DESC
       LIMIT ?
     )`,
    CACHE_LIMIT,
  );
}
