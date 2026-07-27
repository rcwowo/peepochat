import {
  createModerateActionMessage,
  type TwitchModerateActionKind,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import { asRecord, asString } from "@/lib/twitch/twitch-eventsub-parse"

function targetFromActionObject(value: unknown): {
  userName: string
  displayName: string
  expiresAt: string | null
} | null {
  const record = asRecord(value)
  if (!record) return null
  const userName = asString(record.user_login).trim()
  const displayName = asString(record.user_name).trim() || userName
  if (!userName && !displayName) return null
  const expiresAt = asString(record.expires_at).trim() || null
  return {
    userName: userName || displayName.toLowerCase(),
    displayName,
    expiresAt,
  }
}

function durationSecondsFromExpiresAt(
  expiresAt: string | null,
  messageTimestamp: string | null
): number | null {
  if (!expiresAt) return null
  const endsAtMs = Date.parse(expiresAt)
  if (!Number.isFinite(endsAtMs)) return null
  const startMs = messageTimestamp ? Date.parse(messageTimestamp) : Date.now()
  const baseline = Number.isFinite(startMs) ? startMs : Date.now()
  const seconds = Math.round((endsAtMs - baseline) / 1000)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return seconds
}

function normalizeModerateAction(
  action: string
): TwitchModerateActionKind | null {
  switch (action) {
    case "timeout":
    case "shared_chat_timeout":
      return "timeout"
    case "ban":
    case "shared_chat_ban":
      return "ban"
    case "untimeout":
    case "shared_chat_untimeout":
      return "untimeout"
    case "unban":
    case "shared_chat_unban":
      return "unban"
    default:
      return null
  }
}

function actionObjectKey(action: string): string {
  switch (action) {
    case "timeout":
      return "timeout"
    case "ban":
      return "ban"
    case "untimeout":
      return "untimeout"
    case "unban":
      return "unban"
    case "shared_chat_timeout":
      return "shared_chat_timeout"
    case "shared_chat_ban":
      return "shared_chat_ban"
    case "shared_chat_untimeout":
      return "shared_chat_untimeout"
    case "shared_chat_unban":
      return "shared_chat_unban"
    default:
      return action
  }
}

export function createSystemMessageFromChannelModerate({
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
  const actionRaw = asString(event.action).trim()
  const kind = normalizeModerateAction(actionRaw)
  if (!kind) return null

  const target = targetFromActionObject(event[actionObjectKey(actionRaw)])
  if (!target) return null

  const moderatorUserName = asString(event.moderator_user_login).trim()
  const moderatorDisplayName =
    asString(event.moderator_user_name).trim() || moderatorUserName
  if (!moderatorUserName && !moderatorDisplayName) return null

  const channel =
    normalizeChannelLogin(
      channelLogin || asString(event.broadcaster_user_login)
    ) || null
  if (!channel) return null

  const banDurationSeconds =
    kind === "timeout"
      ? durationSecondsFromExpiresAt(target.expiresAt, messageTimestamp ?? null)
      : null

  return createModerateActionMessage({
    channelLogin: channel,
    roomId: roomId ?? (asString(event.broadcaster_user_id) || null),
    action: kind,
    moderatorUserName: moderatorUserName || moderatorDisplayName.toLowerCase(),
    moderatorDisplayName,
    targetUserName: target.userName,
    targetDisplayName: target.displayName,
    banDurationSeconds,
    messageId: messageId ?? null,
    receivedAt: messageTimestamp || undefined,
  })
}
