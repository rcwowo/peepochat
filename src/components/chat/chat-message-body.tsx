import * as React from "react"

import { ChatEmote } from "@/components/chat/chat-emote"
import { ChatCheermote } from "@/components/chat/chat-cheermote"
import type { PingMatchRange } from "@/lib/highlights/highlight-rules"
import { PingMatchMark } from "@/lib/highlights/ping-match-mark"
import { findMessageUrls } from "@/lib/peepochat/peepochat-config"
import { getEmoteConsumedEnd, type TwitchEmote } from "@/lib/twitch/twitch-chat"

const MENTION_PATTERN = /(@[A-Za-z0-9_]+)/g
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

function renderPlainText(
  text: string,
  keyPrefix: string,
  segmentStart = 0,
  highlightRanges: PingMatchRange[] = EMPTY_HIGHLIGHT_RANGES
) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let mentionIndex = 0

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? -1
    if (index < 0) {
      continue
    }

    if (index > lastIndex) {
      pushHighlightedText(
        parts,
        text.slice(lastIndex, index),
        `${keyPrefix}-text-${lastIndex}`,
        segmentStart + lastIndex,
        highlightRanges,
        "chat-message-text"
      )
    }

    const mentionParts: React.ReactNode[] = []
    pushHighlightedText(
      mentionParts,
      match[0],
      `${keyPrefix}-mention-inner-${mentionIndex}`,
      segmentStart + index,
      highlightRanges
    )
    parts.push(
      <span
        key={`${keyPrefix}-mention-${mentionIndex}`}
        className="chat-mention font-semibold"
      >
        {mentionParts}
      </span>
    )

    lastIndex = index + match[0].length
    mentionIndex += 1
  }

  if (lastIndex < text.length) {
    pushHighlightedText(
      parts,
      text.slice(lastIndex),
      `${keyPrefix}-text-${lastIndex}`,
      segmentStart + lastIndex,
      highlightRanges,
      "chat-message-text"
    )
  }

  if (parts.length === 0) {
    pushHighlightedText(
      parts,
      text,
      keyPrefix,
      segmentStart,
      highlightRanges,
      "chat-message-text"
    )
  }

  return parts
}

function renderTextWithLinks(
  text: string,
  keyPrefix: string,
  segmentStart = 0,
  highlightRanges: PingMatchRange[] = EMPTY_HIGHLIGHT_RANGES
) {
  const urls = findMessageUrls(text)

  if (urls.length === 0) {
    return renderPlainText(text, keyPrefix, segmentStart, highlightRanges)
  }

  const parts: React.ReactNode[] = []
  let lastIdx = 0

  for (const match of urls) {
    if (match.start > lastIdx) {
      parts.push(
        ...renderPlainText(
          text.slice(lastIdx, match.start),
          `${keyPrefix}-t-${lastIdx}`,
          segmentStart + lastIdx,
          highlightRanges
        )
      )
    }

    const linkParts: React.ReactNode[] = []
    pushHighlightedText(
      linkParts,
      match.url,
      `${keyPrefix}-l-inner-${match.start}`,
      segmentStart + match.start,
      highlightRanges
    )

    parts.push(
      <a
        key={`${keyPrefix}-l-${match.start}-${match.url}`}
        href={match.url}
        target="_blank"
        rel="noreferrer noopener"
        className="chat-link break-all"
      >
        {linkParts.length > 0 ? linkParts : match.url}
      </a>
    )

    lastIdx = match.end
  }

  if (lastIdx < text.length) {
    parts.push(
      ...renderPlainText(
        text.slice(lastIdx),
        `${keyPrefix}-t-${lastIdx}`,
        segmentStart + lastIdx,
        highlightRanges
      )
    )
  }

  return parts
}

export function ChatMessageBody({
  text,
  emotes,
  pingMatchRange = null,
  highlightRanges,
}: {
  text: string
  emotes: TwitchEmote[]
  pingMatchRange?: PingMatchRange | null
  highlightRanges?: PingMatchRange[] | null
}) {
  const ranges =
    highlightRanges != null
      ? highlightRanges
      : pingMatchRange
        ? [pingMatchRange]
        : EMPTY_HIGHLIGHT_RANGES

  if (emotes.length === 0) {
    return <>{renderTextWithLinks(text, "message", 0, ranges)}</>
  }

  const parts: React.ReactNode[] = []
  let lastIdx = 0

  for (const emote of emotes) {
    if (emote.start > lastIdx) {
      parts.push(
        ...renderTextWithLinks(
          text.slice(lastIdx, emote.start),
          `t-${lastIdx}`,
          lastIdx,
          ranges
        )
      )
    }

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
    } else {
      parts.push(
        <ChatEmote
          key={`e-${emote.provider}-${emote.id}-${emote.start}`}
          emote={emote}
          label={emoteName}
        />
      )
    }
    lastIdx = getEmoteConsumedEnd(emote)
  }

  if (lastIdx < text.length) {
    parts.push(
      ...renderTextWithLinks(
        text.slice(lastIdx),
        `t-${lastIdx}`,
        lastIdx,
        ranges
      )
    )
  }

  return <>{parts}</>
}
