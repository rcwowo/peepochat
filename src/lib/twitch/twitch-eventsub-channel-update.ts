import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import {
  EMPTY_SYSTEM_MESSAGE_META,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
import { asString } from "@/lib/twitch/twitch-eventsub-parse"

export type ChannelUpdateSnapshot = {
  title: string
  categoryName: string
}

export type ParsedChannelUpdate = {
  channelLogin: string
  broadcasterUserId: string
  title: string
  categoryName: string
}

export function formatChannelUpdateValue(value: string): string {
  const trimmed = value.trim()
  return trimmed || "(none)"
}

export function parseChannelUpdateEvent(
  event: Record<string, unknown>
): ParsedChannelUpdate | null {
  const channelLogin = normalizeChannelLogin(
    asString(event.broadcaster_user_login)
  )
  const broadcasterUserId = asString(event.broadcaster_user_id).trim()
  if (!channelLogin || !broadcasterUserId) {
    return null
  }

  return {
    channelLogin,
    broadcasterUserId,
    title: asString(event.title),
    categoryName: asString(event.category_name),
  }
}

export function createChannelUpdateSystemMessages({
  channelLogin,
  roomId,
  messageId,
  messageTimestamp,
  previous,
  next,
}: {
  channelLogin: string
  roomId: string | null
  messageId: string | null
  messageTimestamp: string | null
  previous: ChannelUpdateSnapshot | null
  next: ChannelUpdateSnapshot
}): TwitchSystemMessage[] {
  if (!previous) {
    return []
  }

  const channel = normalizeChannelLogin(channelLogin)
  const receivedAt = messageTimestamp?.trim() || new Date().toISOString()
  const baseId = messageId?.trim()
    ? `${channel}:eventsub:channel_update:${messageId.trim()}`
    : `${channel}:eventsub:channel_update:${receivedAt}`

  const messages: TwitchSystemMessage[] = []

  if (previous.title !== next.title) {
    const text = `Stream title updated: ${formatChannelUpdateValue(next.title)}`
    messages.push({
      id: `${baseId}:title`,
      channel,
      roomId,
      text,
      headline: text,
      details: null,
      receivedAt,
      event: "status",
      level: "info",
      accentColor: null,
      ...EMPTY_SYSTEM_MESSAGE_META,
      msgId: "channel-update-title",
    })
  }

  if (previous.categoryName !== next.categoryName) {
    const text = `Stream category updated: ${formatChannelUpdateValue(next.categoryName)}`
    messages.push({
      id: `${baseId}:category`,
      channel,
      roomId,
      text,
      headline: text,
      details: null,
      receivedAt,
      event: "status",
      level: "info",
      accentColor: null,
      ...EMPTY_SYSTEM_MESSAGE_META,
      msgId: "channel-update-category",
    })
  }

  return messages
}
