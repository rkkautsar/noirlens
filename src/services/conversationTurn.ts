export type ConversationSide = 'en' | 'local';

/**
 * The non-English side of Conversation and Translate. AUTO and explicit
 * English selections fall back to Japanese.
 */
export function preferredLocalLanguage(code: string): string {
  return code !== 'auto' && code !== 'en' ? code : 'ja';
}

/** Which language the translated message is written in, by speaking side. */
export function conversationTargetLanguage(
  side: ConversationSide,
  localLanguage: string,
): string {
  return side === 'en' ? localLanguage : 'en';
}

/** The language the speaker used. */
export function conversationSourceLanguage(
  side: ConversationSide,
  localLanguage: string,
): string {
  return side === 'en' ? 'en' : localLanguage;
}
