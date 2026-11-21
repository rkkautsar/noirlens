import { deleteMeta, readMeta, writeMeta } from './db';

const ORIGINAL_BRIGHTNESS_KEY = 'brightness.original';

/**
 Persisted so a force-quit while the scanner is in its dimmed standby state
 cannot strand the phone at 3% brightness: the next launch can restore the
 value the user had before NoirLens dimmed it.
 */
export async function readOriginalBrightness(): Promise<number | null> {
  const raw = await readMeta(ORIGINAL_BRIGHTNESS_KEY);
  if (raw === null || raw.length === 0) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    return null;
  }
  return value;
}

export async function writeOriginalBrightness(value: number): Promise<void> {
  await writeMeta(ORIGINAL_BRIGHTNESS_KEY, String(value));
}

export async function clearOriginalBrightness(): Promise<void> {
  await deleteMeta(ORIGINAL_BRIGHTNESS_KEY);
}
