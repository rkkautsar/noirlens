import { readMeta, writeMeta } from './db';

const ECO_PREVIEW_KEY = 'settings.ecoPreview';

export async function readEcoPreviewPreference(): Promise<boolean | null> {
  const raw = await readMeta(ECO_PREVIEW_KEY);
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  return null;
}

export async function writeEcoPreviewPreference(value: boolean): Promise<void> {
  await writeMeta(ECO_PREVIEW_KEY, value ? 'true' : 'false');
}
