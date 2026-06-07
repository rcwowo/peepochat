import * as React from "react"

import { ChatEmote } from "@/components/chat/chat-emote"
import { findMessageUrls } from "@/lib/peepochat/peepochat-config"
import type { TwitchEmote } from "@/lib/twitch/twitch-chat"

const MENTION_PATTERN = /(@[A-Za-z0-9_]+)/g

function renderPlainText(text: string, keyPrefix: string) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let mentionIndex = 0

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? -1
    if (index < 0) {
      continue
    }

    if (index > lastIndex) {
      parts.push(
        <span key={`${keyPrefix}-text-${lastIndex}`} className="chat-message-text">
          {text.slice(lastIndex, index)}
        </span>
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
    parts.push(
      <span key={`${keyPrefix}-text-${lastIndex}`} className="chat-message-text">
        {text.slice(lastIndex)}
      </span>
    )
  }

  if (parts.length === 0) {
    return [
      <span key={keyPrefix} className="chat-message-text">
        {text}
      </span>,
    ]
  }

  return parts
}

function renderTextWithLinks(text: string, keyPrefix: string) {
  const urls = findMessageUrls(text)

  if (urls.length === 0) {
    return renderPlainText(text, keyPrefix)
  }

  const parts: React.ReactNode[] = []
  let lastIdx = 0

  for (const [index, match] of urls.entries()) {
    if (match.start > lastIdx) {
      parts.push(...renderPlainText(text.slice(lastIdx, match.start), `${keyPrefix}-t-${lastIdx}`))
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
    parts.push(...renderPlainText(text.slice(lastIdx), `${keyPrefix}-t-${lastIdx}`))
  }

  return parts
}

export function ChatMessageBody({
  text,
  emotes,
}: {
  text: string
  emotes: TwitchEmote[]
}) {
  if (emotes.length === 0) {
    return <>{renderTextWithLinks(text, "message")}</>
  }

  const parts: React.ReactNode[] = []
  let lastIdx = 0

  for (const emote of emotes) {
    if (emote.start > lastIdx) {
      parts.push(
        ...renderTextWithLinks(text.slice(lastIdx, emote.start), `t-${lastIdx}`)
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
    parts.push(...renderTextWithLinks(text.slice(lastIdx), `t-${lastIdx}`))
  }

  return <>{parts}</>
}
