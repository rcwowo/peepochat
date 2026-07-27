import {
  EMPTY_SYSTEM_MESSAGE_META,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type {
  TwitchAutomodHeldMessage,
  TwitchAutomodHeldStatus,
} from "@/lib/twitch/twitch-chat-types"
import {
  asString,
  parseEventSubMessageBody,
} from "@/lib/twitch/twitch-eventsub-parse"

function parseAutomodStatus(value: unknown): TwitchAutomodHeldStatus | null {
  const status = asString(value).trim().toLowerCase()
  switch (status) {
    case "pending":
    case "approved":
    case "denied":
    case "expired":
      return status
    default:
      return null
  }
}

export function automodHeldTimelineId(
  channelLogin: string,
  messageId: string
): string {
  return `${normalizeChannelLogin(channelLogin)}:automod:${messageId.trim()}`
}

export function parseAutomodHeldMessage({
  event,
  channelLogin,
  roomId,
  status = "pending",
}: {
  event: Record<string, unknown>
  channelLogin: string | null
  roomId?: string | null
  status?: TwitchAutomodHeldStatus
}): TwitchAutomodHeldMessage | null {
  const channel =
    normalizeChannelLogin(
      channelLogin || asString(event.broadcaster_user_login)
    ) || null
  const messageId = asString(event.message_id).trim()
  const userId = asString(event.user_id).trim()
  const userName = asString(event.user_login).trim().toLowerCase()
  const displayName = asString(event.user_name).trim() || userName
  if (!channel || !messageId || !userId || (!userName && !displayName)) {
    return null
  }

  const { text, emotes } = parseEventSubMessageBody(event)
  if (!text.trim()) return null

  const heldAt = asString(event.held_at).trim() || new Date().toISOString()

  return {
    id: automodHeldTimelineId(channel, messageId),
    messageId,
    channel,
    roomId: roomId ?? (asString(event.broadcaster_user_id).trim() || null),
    userId,
    userName: userName || displayName.toLowerCase(),
    displayName,
    text,
    emotes,
    color: null,
    receivedAt: heldAt,
    heldAt,
    status,
  }
}

export function parseAutomodUpdateStatus(event: Record<string, unknown>): {
  messageId: string
  status: TwitchAutomodHeldStatus
  channelLogin: string | null
} | null {
  const messageId = asString(event.message_id).trim()
  const status = parseAutomodStatus(event.status)
  if (!messageId || !status || status === "pending") {
    return null
  }

  return {
    messageId,
    status,
    channelLogin:
      normalizeChannelLogin(asString(event.broadcaster_user_login)) || null,
  }
}

export function parseUserMessageHoldEvent(event: Record<string, unknown>): {
  messageId: string
  channelLogin: string | null
  broadcasterUserId: string | null
} | null {
  const messageId = asString(event.message_id).trim()
  if (!messageId) return null

  return {
    messageId,
    channelLogin:
      normalizeChannelLogin(asString(event.broadcaster_user_login)) || null,
    broadcasterUserId: asString(event.broadcaster_user_id).trim() || null,
  }
}

export function parseUserMessageUpdateEvent(event: Record<string, unknown>): {
  messageId: string
  status: TwitchAutomodHeldStatus
  channelLogin: string | null
  broadcasterUserId: string | null
} | null {
  const messageId = asString(event.message_id).trim()
  const status = parseAutomodStatus(event.status)
  if (!messageId || !status || status === "pending") {
    return null
  }

  return {
    messageId,
    status,
    channelLogin:
      normalizeChannelLogin(asString(event.broadcaster_user_login)) || null,
    broadcasterUserId: asString(event.broadcaster_user_id).trim() || null,
  }
}

export function userAutomodHeldNoticeId(
  channelLogin: string,
  messageId: string
): string | null {
  const channel = normalizeChannelLogin(channelLogin)
  const idSuffix = messageId.trim()
  if (!channel || !idSuffix) return null
  return `${channel}:automod:held:${idSuffix}`
}

export function createUserAutomodHeldNotice({
  channelLogin,
  messageId,
}: {
  channelLogin: string
  messageId: string
}): { id: string; message: string } | null {
  const id = userAutomodHeldNoticeId(channelLogin, messageId)
  if (!id) return null

  return {
    id,
    message: "Your message was held for review by Automod.",
  }
}

export function createUserAutomodUpdateSystemMessage({
  channelLogin,
  roomId,
  messageId,
  status,
  receivedAt,
}: {
  channelLogin: string
  roomId?: string | null
  messageId: string
  status: TwitchAutomodHeldStatus
  receivedAt?: string
}): TwitchSystemMessage | null {
  const channel = normalizeChannelLogin(channelLogin)
  const idSuffix = messageId.trim()
  if (!channel || !idSuffix) return null

  let text: string
  switch (status) {
    case "approved":
      text = "Your message was approved and sent."
      break
    case "denied":
      text = "Your message was denied by a moderator."
      break
    case "expired":
      text = "Your held message expired without a review."
      break
    default:
      return null
  }

  const at = receivedAt?.trim() || new Date().toISOString()

  return {
    id: `${channel}:eventsub:mod_action:automod_user:${idSuffix}:${status}`,
    channel,
    roomId: roomId ?? null,
    text,
    headline: text,
    details: null,
    receivedAt: at,
    event: "mod_action",
    level: "info",
    accentColor: null,
    ...EMPTY_SYSTEM_MESSAGE_META,
  }
}
