import {
  type SharedChatParticipant,
  type SharedChatSession,
} from "@/lib/chat/shared-chat"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import { asRecord, asString } from "@/lib/twitch/twitch-eventsub-parse"

function parseParticipant(value: unknown): SharedChatParticipant | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const userId = asString(record.broadcaster_user_id).trim()
  const login = normalizeChannelLogin(asString(record.broadcaster_user_login))
  const displayName = asString(record.broadcaster_user_name).trim() || login
  if (!userId) {
    return null
  }

  return {
    userId,
    login,
    displayName,
  }
}

function parseParticipants(value: unknown): SharedChatParticipant[] {
  if (!Array.isArray(value)) {
    return []
  }

  const participants: SharedChatParticipant[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    const participant = parseParticipant(entry)
    if (!participant || seen.has(participant.userId)) {
      continue
    }
    seen.add(participant.userId)
    participants.push(participant)
  }
  return participants
}

export type ParsedSharedChatSessionEvent = {
  channelLogin: string
  broadcasterUserId: string
  session: SharedChatSession
}

export type ParsedSharedChatEndEvent = {
  channelLogin: string
  broadcasterUserId: string
  sessionId: string
  hostUserId: string
}

export function parseSharedChatSessionEvent(
  event: Record<string, unknown>
): ParsedSharedChatSessionEvent | null {
  const channelLogin = normalizeChannelLogin(
    asString(event.broadcaster_user_login)
  )
  const broadcasterUserId = asString(event.broadcaster_user_id).trim()
  const sessionId = asString(event.session_id).trim()
  const hostUserId = asString(event.host_broadcaster_user_id).trim()
  if (!channelLogin || !broadcasterUserId || !sessionId) {
    return null
  }

  return {
    channelLogin,
    broadcasterUserId,
    session: {
      sessionId,
      hostUserId: hostUserId || broadcasterUserId,
      participants: parseParticipants(event.participants),
    },
  }
}

export function parseSharedChatEndEvent(
  event: Record<string, unknown>
): ParsedSharedChatEndEvent | null {
  const channelLogin = normalizeChannelLogin(
    asString(event.broadcaster_user_login)
  )
  const broadcasterUserId = asString(event.broadcaster_user_id).trim()
  const sessionId = asString(event.session_id).trim()
  const hostUserId = asString(event.host_broadcaster_user_id).trim()
  if (!channelLogin || !broadcasterUserId || !sessionId) {
    return null
  }

  return {
    channelLogin,
    broadcasterUserId,
    sessionId,
    hostUserId: hostUserId || broadcasterUserId,
  }
}
