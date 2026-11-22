import { readMeta, writeMeta } from './db';

export async function readScanCount(dayKey: string): Promise<number> {
  const raw = await readMeta(`scans.day.${dayKey}`);
  const count = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(count) ? count : 0;
}

export async function writeScanCount(
  dayKey: string,
  count: number,
): Promise<void> {
  await writeMeta(`scans.day.${dayKey}`, String(count));
}
