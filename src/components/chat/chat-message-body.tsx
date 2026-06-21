import * as React from "react"

import { ChatEmote } from "@/components/chat/chat-emote"
import type { PingMatchRange } from "@/lib/highlights/highlight-rules"
import { PingMatchMark } from "@/lib/highlights/ping-match-mark"
import { findMessageUrls } from "@/lib/peepochat/peepochat-config"
import type { TwitchEmote } from "@/lib/twitch/twitch-chat"

const MENTION_PATTERN = /(@[A-Za-z0-9_]+)/g

function renderPlainText(
  text: string,
  keyPrefix: string,
  segmentStart = 0,
  pingMatchRange: PingMatchRange | null = null
) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let mentionIndex = 0

  const pushTextSlice = (sliceStart: number, sliceEnd: number, key: string) => {
    if (sliceStart >= sliceEnd) {
      return
    }

    const absoluteStart = segmentStart + sliceStart
    const absoluteEnd = segmentStart + sliceEnd

    if (
      !pingMatchRange ||
      absoluteEnd <= pingMatchRange.start ||
      absoluteStart >= pingMatchRange.end
    ) {
      parts.push(
        <span key={key} className="chat-message-text">
          {text.slice(sliceStart, sliceEnd)}
        </span>
      )
      return
    }

    const overlapStart = Math.max(0, pingMatchRange.start - absoluteStart)
    const overlapEnd = Math.min(
      sliceEnd - sliceStart,
      pingMatchRange.end - absoluteStart
    )

    if (overlapStart > 0) {
      parts.push(
        <span key={`${key}-pre`} className="chat-message-text">
          {text.slice(sliceStart, sliceStart + overlapStart)}
        </span>
      )
    }

    parts.push(
      <PingMatchMark key={`${key}-match`}>
        {text.slice(sliceStart + overlapStart, sliceStart + overlapEnd)}
      </PingMatchMark>
    )

    if (overlapEnd < sliceEnd - sliceStart) {
      parts.push(
        <span key={`${key}-post`} className="chat-message-text">
          {text.slice(sliceStart + overlapEnd, sliceEnd)}
        </span>
      )
    }
  }

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? -1
    if (index < 0) {
      continue
    }

    if (index > lastIndex) {
      pushTextSlice(
        lastIndex,
        index,
        `${keyPrefix}-text-${lastIndex}`
      )
    }

    parts.push(
      <span
        key={`${keyPrefix}-mention-${mentionIndex}`}
        className="chat-mention font-semibold"
      >
        {match[0]}
      </span>
    )

    lastIndex = index + match[0].length
    mentionIndex += 1
  }

  if (lastIndex < text.length) {
    pushTextSlice(lastIndex, text.length, `${keyPrefix}-text-${lastIndex}`)
  }

  if (parts.length === 0) {
    pushTextSlice(0, text.length, keyPrefix)
  }

  return parts
}

function renderTextWithLinks(
  text: string,
  keyPrefix: string,
  segmentStart = 0,
  pingMatchRange: PingMatchRange | null = null
) {
  const urls = findMessageUrls(text)

  if (urls.length === 0) {
    return renderPlainText(text, keyPrefix, segmentStart, pingMatchRange)
  }

  const parts: React.ReactNode[] = []
  let lastIdx = 0

  for (const [index, match] of urls.entries()) {
    if (match.start > lastIdx) {
      parts.push(
        ...renderPlainText(
          text.slice(lastIdx, match.start),
          `${keyPrefix}-t-${lastIdx}`,
          segmentStart + lastIdx,
          pingMatchRange
        )
      )
    }

    parts.push(
      <a
        key={`${keyPrefix}-l-${index}-${match.start}`}
        href={match.url}
        target="_blank"
        rel="noreferrer noopener"
        className="chat-link break-all"
      >
        {match.url}
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
        pingMatchRange
      )
    )
  }

  return parts
}

export function ChatMessageBody({
  text,
  emotes,
  pingMatchRange = null,
}: {
  text: string
  emotes: TwitchEmote[]
  pingMatchRange?: PingMatchRange | null
}) {
  if (emotes.length === 0) {
    return <>{renderTextWithLinks(text, "message", 0, pingMatchRange)}</>
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
          pingMatchRange
        )
      )
    }

    const emoteName = text.slice(emote.start, emote.end + 1)
    parts.push(
      <ChatEmote
        key={`e-${emote.provider}-${emote.id}-${emote.start}`}
        emote={emote}
        label={emoteName}
      />
    )
    lastIdx = emote.end + 1
  }

  if (lastIdx < text.length) {
    parts.push(
      ...renderTextWithLinks(text.slice(lastIdx), `t-${lastIdx}`, lastIdx, pingMatchRange)
    )
  }

  return <>{parts}</>
}
