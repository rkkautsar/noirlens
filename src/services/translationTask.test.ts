import { describe, expect, it, vi, beforeEach } from 'vitest';

const translate = vi.fn();
const prepareLanguagePack = vi.fn();
const checkLanguagePackStatus = vi.fn();

vi.mock('../../modules/native-vision-translator', () => ({
  default: { translate, prepareLanguagePack, checkLanguagePackStatus },
}));

const { translateText, installPack } = await import('./translationTask');

describe('translationTask', () => {
  beforeEach(() => {
    translate.mockReset();
    prepareLanguagePack.mockReset();
    checkLanguagePackStatus.mockReset();
    checkLanguagePackStatus.mockResolvedValue({ status: 'supported' });
  });

  it('returns translated text and cache state', async () => {
    translate.mockResolvedValue({ translatedText: 'hello', cached: true });
    await expect(
      translateText({ text: 'salut', sourceLanguage: 'fr' }),
    ).resolves.toEqual({ status: 'translated', text: 'hello', cached: true });
  });

  it('classifies a missing pack separately from a failed translation', async () => {
    translate.mockRejectedValue({ code: 'ERR_LANGUAGE_PACK_MISSING' });
    await expect(
      translateText({ text: 'a', sourceLanguage: 'fr' }),
    ).resolves.toMatchObject({ status: 'pack_missing' });
  });

  it('classifies an unsupported pair so no download is offered', async () => {
    translate.mockRejectedValue({ code: 'ERR_LANGUAGE_UNSUPPORTED' });
    await expect(
      translateText({ text: 'a', sourceLanguage: 'xx' }),
    ).resolves.toMatchObject({ status: 'unsupported' });
  });

  it('classifies generic failures', async () => {
    translate.mockRejectedValue({ code: 'ERR_TRANSLATION_FAILED' });
    await expect(
      translateText({ text: 'a', sourceLanguage: 'fr' }),
    ).resolves.toMatchObject({ status: 'failed' });
  });

  it('reports pack installation outcomes', async () => {
    prepareLanguagePack.mockResolvedValue({ status: 'installed' });
    await expect(installPack('fr')).resolves.toBe('installed');
    prepareLanguagePack.mockRejectedValue(new Error('nope'));
    await expect(installPack('fr')).resolves.toBe('failed');
    prepareLanguagePack.mockResolvedValue({ status: 'cancelled' });
    await expect(installPack('fr', 'en', 'req-1')).resolves.toBe('cancelled');
    prepareLanguagePack.mockRejectedValue({
      code: 'ERR_LANGUAGE_PACK_CANCELLED',
    });
    await expect(installPack('fr', 'en', 'req-2')).resolves.toBe('cancelled');
  });
});
