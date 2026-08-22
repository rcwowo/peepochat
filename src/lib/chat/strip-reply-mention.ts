import type { PingMatchRange } from "@/lib/highlights/highlight-rules"
import type { TwitchChatReply, TwitchEmote } from "@/lib/twitch/twitch-chat"

function getLeadingReplyMentionStripOffset(
  text: string,
  reply: TwitchChatReply
): number {
  const candidates = [reply.parentDisplayName, reply.parentUserName].filter(
    (name, index, array) => name.length > 0 && array.indexOf(name) === index
  )

  for (const name of candidates) {
    if (!text.startsWith("@")) {
      return 0
    }

    const mentionBody = text.slice(1, 1 + name.length)
    if (mentionBody.toLowerCase() !== name.toLowerCase()) {
      continue
    }

    const afterMentionIndex = 1 + name.length
    if (text.length <= afterMentionIndex || text[afterMentionIndex] !== " ") {
      continue
    }

    return afterMentionIndex + 1
  }

  return 0
}

function adjustEmote(emote: TwitchEmote, offset: number): TwitchEmote | null {
  if (emote.start < offset) {
    return null
  }

  return {
    ...emote,
    start: emote.start - offset,
    end: emote.end - offset,
    overlays: emote.overlays
      ?.map((overlay) => adjustEmote(overlay, offset))
      .filter((overlay): overlay is TwitchEmote => overlay !== null),
  }
}

function adjustEmotes(emotes: TwitchEmote[], offset: number): TwitchEmote[] {
  if (offset === 0) {
    return emotes
  }

  return emotes
    .map((emote) => adjustEmote(emote, offset))
    .filter((emote): emote is TwitchEmote => emote !== null)
}

export function adjustHighlightRangesForReplyStrip(
  ranges: PingMatchRange[] | null | undefined,
  offset: number
): PingMatchRange[] | null {
  if (!ranges || offset === 0) {
    return ranges ?? null
  }

  const adjusted = ranges
    .map((range) => ({
      start: range.start - offset,
      end: range.end - offset,
    }))
    .filter((range) => range.end > 0)
    .map((range) => ({
      start: Math.max(0, range.start),
      end: range.end,
    }))
    .filter((range) => range.start < range.end)

  return adjusted.length > 0 ? adjusted : null
}

export function getReplyDisplayContent(
  text: string,
  emotes: TwitchEmote[],
  reply: TwitchChatReply | null
): { text: string; emotes: TwitchEmote[]; stripOffset: number } {
  if (!reply) {
    return { text, emotes, stripOffset: 0 }
  }

  const stripOffset = getLeadingReplyMentionStripOffset(text, reply)
  if (stripOffset === 0) {
    return { text, emotes, stripOffset: 0 }
  }

  return {
    text: text.slice(stripOffset),
    emotes: adjustEmotes(emotes, stripOffset),
    stripOffset,
  }
}
