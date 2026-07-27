import {
  EMPTY_SYSTEM_MESSAGE_META,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type {
  TwitchSuspiciousUserMessage,
  TwitchSuspiciousUserStatus,
} from "@/lib/twitch/twitch-chat-types"
import {
  asRecord,
  asString,
  emotesFromV2Fragments,
} from "@/lib/twitch/twitch-eventsub-parse"

function parseMessageBody(event: Record<string, unknown>): {
  messageId: string
  text: string
  emotes: ReturnType<typeof emotesFromV2Fragments>["emotes"]
} {
  const record = asRecord(event.message)
  if (!record) {
    return { messageId: "", text: "", emotes: [] }
  }

  const messageId = asString(record.message_id).trim()
  const fromFragments = emotesFromV2Fragments(record.fragments)
  const text = asString(record.text) || fromFragments.text

  return {
    messageId,
    text,
    emotes: fromFragments.emotes,
  }
}

function parseSuspiciousStatus(
  value: unknown
): TwitchSuspiciousUserStatus | null {
  switch (asString(value).trim().toLowerCase()) {
    case "active_monitoring":
      return "monitored"
    case "restricted":
      return "restricted"
    default:
      return null
  }
}

export type SuspiciousUserUpdateStatus = TwitchSuspiciousUserStatus | "none"

function parseSuspiciousUpdateStatus(
  value: unknown
): SuspiciousUserUpdateStatus | null {
  const status = asString(value).trim().toLowerCase()
  if (status === "none") return "none"
  return parseSuspiciousStatus(status)
}

export function parseSuspiciousUserMessage({
  event,
  channelLogin,
  roomId,
  receivedAt,
}: {
  event: Record<string, unknown>
  channelLogin: string | null
  roomId?: string | null
  receivedAt?: string | null
}): TwitchSuspiciousUserMessage | null {
  const channel =
    normalizeChannelLogin(
      channelLogin || asString(event.broadcaster_user_login)
    ) || null
  const status = parseSuspiciousStatus(event.low_trust_status)
  const userId = asString(event.user_id).trim()
  const userName = asString(event.user_login).trim().toLowerCase()
  const displayName = asString(event.user_name).trim() || userName
  const { messageId, text, emotes } = parseMessageBody(event)

  if (
    !channel ||
    !status ||
    !messageId ||
    !userId ||
    (!userName && !displayName) ||
    !text.trim()
  ) {
    return null
  }

  return {
    id: messageId,
    messageId,
    channel,
    roomId: roomId ?? (asString(event.broadcaster_user_id).trim() || null),
    userId,
    userName: userName || displayName.toLowerCase(),
    displayName,
    text,
    emotes,
    color: null,
    receivedAt: receivedAt?.trim() || new Date().toISOString(),
    status,
    deletedAt: null,
  }
}

export function createSystemMessageFromSuspiciousUserUpdate({
  event,
  channelLogin,
  roomId,
  messageId,
  messageTimestamp,
}: {
  event: Record<string, unknown>
  channelLogin: string | null
  roomId?: string | null
  messageId?: string | null
  messageTimestamp?: string | null
}): TwitchSystemMessage | null {
  const channel =
    normalizeChannelLogin(
      channelLogin || asString(event.broadcaster_user_login)
    ) || null
  const status = parseSuspiciousUpdateStatus(event.low_trust_status)
  const moderatorUserName = asString(event.moderator_user_login)
    .trim()
    .toLowerCase()
  const moderatorDisplayName =
    asString(event.moderator_user_name).trim() || moderatorUserName
  const targetUserName = asString(event.user_login).trim().toLowerCase()
  const targetDisplayName = asString(event.user_name).trim() || targetUserName

  if (
    !channel ||
    !status ||
    (!moderatorUserName && !moderatorDisplayName) ||
    (!targetUserName && !targetDisplayName)
  ) {
    return null
  }

  const moderator = moderatorDisplayName || moderatorUserName
  const target = targetDisplayName || targetUserName

  let text: string
  switch (status) {
    case "monitored":
      text = `${moderator} added ${target} as a monitored suspicious chatter.`
      break
    case "restricted":
      text = `${moderator} added ${target} as a restricted suspicious chatter.`
      break
    case "none":
      text = `${moderator} removed ${target} from the suspicious user list.`
      break
    default:
      return null
  }

  const receivedAt = messageTimestamp?.trim() || new Date().toISOString()
  const id = messageId?.trim()
    ? `${channel}:eventsub:mod_action:suspicious_update:${messageId.trim()}`
    : `${channel}:eventsub:mod_action:suspicious_update:${status}:${targetUserName || target}:${receivedAt}`

  return {
    id,
    channel,
    roomId: roomId ?? (asString(event.broadcaster_user_id).trim() || null),
    text,
    headline: text,
    details: null,
    receivedAt,
    event: "mod_action",
    level: "info",
    accentColor: null,
    ...EMPTY_SYSTEM_MESSAGE_META,
    actor: {
      userName: moderatorUserName || moderatorDisplayName.toLowerCase(),
      displayName: moderator,
      color: null,
    },
  }
}
