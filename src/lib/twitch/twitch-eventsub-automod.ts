import {
  EMPTY_SYSTEM_MESSAGE_META,
  type TwitchEmote,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type {
  TwitchAutomodHeldMessage,
  TwitchAutomodHeldStatus,
} from "@/lib/twitch/twitch-chat-types"

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}


function twitchEmoteImageUrl(emoteId: string): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(emoteId)}/animated/dark/1.0`
}

function emotesFromV2Fragments(fragments: unknown): {
  text: string
  emotes: TwitchEmote[]
} {
  if (!Array.isArray(fragments)) {
    return { text: "", emotes: [] }
  }

  let text = ""
  const emotes: TwitchEmote[] = []

  for (const fragment of fragments) {
    const record = asRecord(fragment)
    if (!record) continue

    const fragmentText = asString(record.text)
    if (!fragmentText) continue

    const type = asString(record.type)
    const start = text.length
    text += fragmentText
    const end = text.length - 1

    if (type !== "emote") continue

    const emote = asRecord(record.emote)
    const emoteId = asString(emote?.id).trim()
    if (!emoteId) continue

    emotes.push({
      id: emoteId,
      code: fragmentText,
      provider: "twitch",
      imageUrl: twitchEmoteImageUrl(emoteId),
      start,
      end,
    })
  }

  return { text, emotes }
}

function emotesFromV1Fragments(
  messageText: string,
  fragments: unknown
): TwitchEmote[] {
  const record = asRecord(fragments)
  const emoteList = Array.isArray(record?.emotes) ? record.emotes : []
  if (emoteList.length === 0 || !messageText) return []

  const emotes: TwitchEmote[] = []
  let searchFrom = 0

  for (const entry of emoteList) {
    const emote = asRecord(entry)
    if (!emote) continue
    const code = asString(emote.text)
    const emoteId = asString(emote.id).trim()
    if (!code || !emoteId) continue

    const start = messageText.indexOf(code, searchFrom)
    if (start < 0) continue
    const end = start + code.length - 1
    searchFrom = end + 1

    emotes.push({
      id: emoteId,
      code,
      provider: "twitch",
      imageUrl: twitchEmoteImageUrl(emoteId),
      start,
      end,
    })
  }

  return emotes.sort((a, b) => a.start - b.start)
}

function parseMessageBody(event: Record<string, unknown>): {
  text: string
  emotes: TwitchEmote[]
} {
  const message = event.message
  if (typeof message === "string") {
    return {
      text: message,
      emotes: emotesFromV1Fragments(message, event.fragments),
    }
  }

  const record = asRecord(message)
  if (!record) {
    return { text: "", emotes: [] }
  }

  const fromFragments = emotesFromV2Fragments(record.fragments)
  const text = asString(record.text) || fromFragments.text
  if (fromFragments.emotes.length > 0) {
    return { text, emotes: fromFragments.emotes }
  }

  return {
    text,
    emotes: emotesFromV1Fragments(text, event.fragments),
  }
}

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

  const { text, emotes } = parseMessageBody(event)
  if (!text.trim()) return null

  const heldAt =
    asString(event.held_at).trim() || new Date().toISOString()

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

export function parseAutomodUpdateStatus(
  event: Record<string, unknown>
): {
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
