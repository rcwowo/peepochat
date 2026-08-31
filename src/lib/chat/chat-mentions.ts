const CHAT_MENTION_PATTERN = /(?<![A-Za-z0-9_])(@[A-Za-z0-9_]+)/g

export function matchChatMentions(text: string) {
  CHAT_MENTION_PATTERN.lastIndex = 0
  return text.matchAll(CHAT_MENTION_PATTERN)
}

export function textHasChatMention(text: string) {
  CHAT_MENTION_PATTERN.lastIndex = 0
  return CHAT_MENTION_PATTERN.test(text)
}
