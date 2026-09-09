import { matchChatMentions } from "@/lib/chat/presentation/mentions"
import { findMessageUrls } from "@/lib/peepochat/peepochat-config"
import {
  getEmoteConsumedEnd,
  getGifConsumedEnd,
  type TwitchChatGif,
  type TwitchEmote,
} from "@/lib/twitch/chat/chat"

export type MessageBodyToken =
  | { kind: "text"; start: number; end: number }
  | { kind: "mention"; start: number; end: number }
  | { kind: "url"; start: number; end: number; url: string }
  | { kind: "emote"; emote: TwitchEmote }
  | { kind: "gif"; gif: TwitchChatGif }

const EMPTY_GIFS: TwitchChatGif[] = []

const tokenCache = new WeakMap<
  TwitchEmote[] | TwitchChatGif[],
  { text: string; gifs: TwitchChatGif[]; tokens: MessageBodyToken[] }
>()

type MessageBodySpan =
  | {
      kind: "emote"
      start: number
      consumedEnd: number
      emote: TwitchEmote
    }
  | {
      kind: "gif"
      start: number
      consumedEnd: number
      gif: TwitchChatGif
    }

function collectMessageBodySpans(
  emotes: TwitchEmote[],
  gifs: TwitchChatGif[]
): MessageBodySpan[] {
  const spans: MessageBodySpan[] = [
    ...gifs.map((gif) => ({
      kind: "gif" as const,
      start: gif.start,
      consumedEnd: getGifConsumedEnd(gif),
      gif,
    })),
    ...emotes.map((emote) => ({
      kind: "emote" as const,
      start: emote.start,
      consumedEnd: getEmoteConsumedEnd(emote),
      emote,
    })),
  ]

  spans.sort((left, right) => left.start - right.start)

  const visible: MessageBodySpan[] = []
  let lastEnd = 0
  for (const span of spans) {
    if (span.start < lastEnd) {
      continue
    }
    visible.push(span)
    lastEnd = span.consumedEnd
  }

  return visible
}

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
  emotes: TwitchEmote[],
  gifs: TwitchChatGif[] = EMPTY_GIFS
): MessageBodyToken[] {
  const tokens: MessageBodyToken[] = []
  const spans = collectMessageBodySpans(emotes, gifs)

  if (spans.length === 0) {
    pushTextTokens(tokens, text, 0)
    return tokens
  }

  let lastIdx = 0
  for (const span of spans) {
    if (span.start > lastIdx) {
      pushTextTokens(tokens, text.slice(lastIdx, span.start), lastIdx)
    }
    if (span.kind === "gif") {
      tokens.push({ kind: "gif", gif: span.gif })
    } else {
      tokens.push({ kind: "emote", emote: span.emote })
    }
    lastIdx = span.consumedEnd
  }

  if (lastIdx < text.length) {
    pushTextTokens(tokens, text.slice(lastIdx), lastIdx)
  }

  return tokens
}

export function getMessageBodyTokens(
  text: string,
  emotes: TwitchEmote[],
  gifs: TwitchChatGif[] = EMPTY_GIFS
): MessageBodyToken[] {
  if (emotes.length === 0 && gifs.length === 0) {
    return tokenizeMessageBody(text, emotes, gifs)
  }

  const cacheKey = emotes.length > 0 ? emotes : gifs
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.text === text && cached.gifs === gifs) {
    return cached.tokens
  }

  const tokens = tokenizeMessageBody(text, emotes, gifs)
  tokenCache.set(cacheKey, { text, gifs, tokens })
  return tokens
}
