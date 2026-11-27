import { describe, expect, it } from 'vitest';

import {
  conversationSourceLanguage,
  conversationTargetLanguage,
  preferredLocalLanguage,
} from './conversationTurn';

describe('conversation turn routing', () => {
  it('falls back to Japanese for AUTO or English preferences', () => {
    expect(preferredLocalLanguage('auto')).toBe('ja');
    expect(preferredLocalLanguage('en')).toBe('ja');
  });

  it('uses the preferred non-English language', () => {
    expect(preferredLocalLanguage('ko')).toBe('ko');
    expect(preferredLocalLanguage('zh-Hans')).toBe('zh-Hans');
  });

  it('routes English speech into the local side', () => {
    expect(conversationSourceLanguage('en', 'ja')).toBe('en');
    expect(conversationTargetLanguage('en', 'ja')).toBe('ja');
  });

  it('routes local speech into English', () => {
    expect(conversationSourceLanguage('local', 'ko')).toBe('ko');
    expect(conversationTargetLanguage('local', 'ko')).toBe('en');
  });
});
