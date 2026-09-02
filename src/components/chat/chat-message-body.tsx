import * as React from "react"

import { ChatCheermote } from "@/components/chat/chat-cheermote"
import { ChatEmote } from "@/components/chat/chat-emote"
import { ChatMention } from "@/components/chat/chat-mention"
import { getMessageBodyTokens } from "@/lib/chat/chat-message-body-tokens"
import type { PingMatchRange } from "@/lib/highlights/highlight-rules"
import { PingMatchMark } from "@/lib/highlights/ping-match-mark"
import type { TwitchEmote } from "@/lib/twitch/twitch-chat"

const EMPTY_HIGHLIGHT_RANGES: PingMatchRange[] = []

function overlappingHighlightRanges(
  absoluteStart: number,
  absoluteEnd: number,
  ranges: PingMatchRange[]
) {
  if (ranges.length === 0 || absoluteStart >= absoluteEnd) {
    return EMPTY_HIGHLIGHT_RANGES
  }

  const overlaps: PingMatchRange[] = []
  for (const range of ranges) {
    const start = Math.max(absoluteStart, range.start)
    const end = Math.min(absoluteEnd, range.end)
    if (start < end) {
      overlaps.push({ start, end })
    }
  }

  if (overlaps.length <= 1) {
    return overlaps
  }

  overlaps.sort((left, right) => left.start - right.start)
  const merged: PingMatchRange[] = [{ ...overlaps[0]! }]
  for (let index = 1; index < overlaps.length; index += 1) {
    const range = overlaps[index]!
    const last = merged[merged.length - 1]!
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }

  return merged
}

function pushHighlightedText(
  parts: React.ReactNode[],
  text: string,
  keyPrefix: string,
  segmentStart: number,
  highlightRanges: PingMatchRange[],
  className?: string
) {
  if (!text) {
    return
  }

  const absoluteStart = segmentStart
  const absoluteEnd = segmentStart + text.length
  const overlaps = overlappingHighlightRanges(
    absoluteStart,
    absoluteEnd,
    highlightRanges
  )

  if (overlaps.length === 0) {
    parts.push(
      <span key={keyPrefix} className={className}>
        {text}
      </span>
    )
    return
  }

  let cursor = absoluteStart
  let sliceIndex = 0
  for (const range of overlaps) {
    if (range.start > cursor) {
      parts.push(
        <span key={`${keyPrefix}-pre-${sliceIndex}`} className={className}>
          {text.slice(cursor - absoluteStart, range.start - absoluteStart)}
        </span>
      )
    }

    parts.push(
      <PingMatchMark key={`${keyPrefix}-match-${sliceIndex}`}>
        {text.slice(range.start - absoluteStart, range.end - absoluteStart)}
      </PingMatchMark>
    )
    cursor = range.end
    sliceIndex += 1
  }

  if (cursor < absoluteEnd) {
    parts.push(
      <span key={`${keyPrefix}-post`} className={className}>
        {text.slice(cursor - absoluteStart)}
      </span>
    )
  }
}

function ChatMessageBodyInner({
  text,
  emotes,
  pingMatchRange = null,
  highlightRanges,
  channelLogin,
}: {
  text: string
  emotes: TwitchEmote[]
  pingMatchRange?: PingMatchRange | null
  highlightRanges?: PingMatchRange[] | null
  channelLogin?: string
}) {
  const ranges =
    highlightRanges != null
      ? highlightRanges
      : pingMatchRange
        ? [pingMatchRange]
        : EMPTY_HIGHLIGHT_RANGES

  const tokens = getMessageBodyTokens(text, emotes)
  const parts: React.ReactNode[] = []

  for (const token of tokens) {
    if (token.kind === "emote") {
      const emote = token.emote
      const emoteName = text.slice(emote.start, emote.end + 1)
      if (emote.cheermote) {
        parts.push(
          <ChatCheermote
            key={`c-${emote.start}-${emote.cheermote.amount}`}
            imageUrl={emote.imageUrl}
            amount={emote.cheermote.amount}
            color={emote.cheermote.color}
            label={emoteName}
          />
        )
        continue
      }

      parts.push(
        <ChatEmote
          key={`e-${emote.provider}-${emote.id}-${emote.start}`}
          emote={emote}
          label={emoteName}
        />
      )
      continue
    }

    const slice = text.slice(token.start, token.end)
    if (token.kind === "mention") {
      const mentionParts: React.ReactNode[] = []
      pushHighlightedText(
        mentionParts,
        slice,
        `mention-inner-${token.start}`,
        token.start,
        ranges
      )
      parts.push(
        <ChatMention
          key={`mention-${token.start}`}
          mention={slice}
          channelLogin={channelLogin}
        >
          {mentionParts}
        </ChatMention>
      )
      continue
    }

    if (token.kind === "url") {
      const linkParts: React.ReactNode[] = []
      pushHighlightedText(
        linkParts,
        token.url,
        `l-inner-${token.start}`,
        token.start,
        ranges
      )
      parts.push(
        <a
          key={`l-${token.start}-${token.url}`}
          href={token.url}
          target="_blank"
          rel="noreferrer noopener"
          className="chat-link break-all"
        >
          {linkParts.length > 0 ? linkParts : token.url}
        </a>
      )
      continue
    }

    pushHighlightedText(
      parts,
      slice,
      `t-${token.start}`,
      token.start,
      ranges,
      "chat-message-text"
    )
  }

  return <>{parts}</>
}

export const ChatMessageBody = React.memo(ChatMessageBodyInner)
