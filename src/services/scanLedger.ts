import { getDatabase } from './db';

export async function readScanCount(dayKey: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT count FROM scan_days WHERE day_key = ? LIMIT 1',
    dayKey,
  );
  return row?.count ?? 0;
}

export async function writeScanCount(
  dayKey: string,
  count: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO scan_days (day_key, count) VALUES (?, ?)
     ON CONFLICT(day_key) DO UPDATE SET count = excluded.count`,
    dayKey,
    count,
  );
}
