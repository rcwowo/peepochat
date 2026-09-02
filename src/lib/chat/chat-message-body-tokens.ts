import { matchChatMentions } from "@/lib/chat/chat-mentions"
import { findMessageUrls } from "@/lib/peepochat/peepochat-config"
import { getEmoteConsumedEnd, type TwitchEmote } from "@/lib/twitch/twitch-chat"

export type MessageBodyToken =
  | { kind: "text"; start: number; end: number }
  | { kind: "mention"; start: number; end: number }
  | { kind: "url"; start: number; end: number; url: string }
  | { kind: "emote"; emote: TwitchEmote }

const tokenCache = new WeakMap<
  TwitchEmote[],
  { text: string; tokens: MessageBodyToken[] }
>()

function pushPlainTextTokens(
  tokens: MessageBodyToken[],
  text: string,
  segmentStart: number
) {
  let lastIndex = 0

  for (const match of matchChatMentions(text)) {
    const index = match.index ?? -1
    if (index < 0) {
      continue
    }

    if (index > lastIndex) {
      tokens.push({
        kind: "text",
        start: segmentStart + lastIndex,
        end: segmentStart + index,
      })
    }

    tokens.push({
      kind: "mention",
      start: segmentStart + index,
      end: segmentStart + index + match[0].length,
    })
    lastIndex = index + match[0].length
  }

  if (lastIndex < text.length) {
    tokens.push({
      kind: "text",
      start: segmentStart + lastIndex,
      end: segmentStart + text.length,
    })
  }
}

function pushTextTokens(
  tokens: MessageBodyToken[],
  text: string,
  segmentStart: number
) {
  if (!text) {
    return
  }

  const urls = findMessageUrls(text)
  if (urls.length === 0) {
    pushPlainTextTokens(tokens, text, segmentStart)
    return
  }

  let lastIdx = 0
  for (const match of urls) {
    if (match.start > lastIdx) {
      pushPlainTextTokens(
        tokens,
        text.slice(lastIdx, match.start),
        segmentStart + lastIdx
      )
    }

    tokens.push({
      kind: "url",
      start: segmentStart + match.start,
      end: segmentStart + match.end,
      url: match.url,
    })
    lastIdx = match.end
  }

  if (lastIdx < text.length) {
    pushPlainTextTokens(tokens, text.slice(lastIdx), segmentStart + lastIdx)
  }
}

export function tokenizeMessageBody(
  text: string,
  emotes: TwitchEmote[]
): MessageBodyToken[] {
  const tokens: MessageBodyToken[] = []

  if (emotes.length === 0) {
    pushTextTokens(tokens, text, 0)
    return tokens
  }

  let lastIdx = 0
  for (const emote of emotes) {
    if (emote.start > lastIdx) {
      pushTextTokens(tokens, text.slice(lastIdx, emote.start), lastIdx)
    }
    tokens.push({ kind: "emote", emote })
    lastIdx = getEmoteConsumedEnd(emote)
  }

  if (lastIdx < text.length) {
    pushTextTokens(tokens, text.slice(lastIdx), lastIdx)
  }

  return tokens
}

export function getMessageBodyTokens(
  text: string,
  emotes: TwitchEmote[]
): MessageBodyToken[] {
  if (emotes.length === 0) {
    return tokenizeMessageBody(text, emotes)
  }

  const cached = tokenCache.get(emotes)
  if (cached && cached.text === text) {
    return cached.tokens
  }

  const tokens = tokenizeMessageBody(text, emotes)
  tokenCache.set(emotes, { text, tokens })
  return tokens
}
