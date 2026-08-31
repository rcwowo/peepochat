import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"

export type SharedChatParticipant = {
  userId: string
  login: string
  displayName: string
}

export type SharedChatSourceProfile = SharedChatParticipant & {
  profileImageUrl: string
}

export type SharedChatSession = {
  sessionId: string
  hostUserId: string
  participants: SharedChatParticipant[]
}

export function sharedChatNoticeId(channelLogin: string, suffix: string) {
  const channel = normalizeChannelLogin(channelLogin)
  return `shared-chat:${channel}:${suffix}`
}

function joinEnglishList(items: string[]): string {
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
}

export function otherSharedChatParticipants(
  participants: SharedChatParticipant[],
  currentUserId: string | null
): SharedChatParticipant[] {
  const current = currentUserId?.trim() ?? ""
  if (!current) {
    return participants
  }

  return participants.filter((participant) => participant.userId !== current)
}

export function formatSharedChatParticipantsNotice(
  participants: SharedChatParticipant[],
  currentUserId: string | null,
  variant: "active" | "now"
): string | null {
  const names = otherSharedChatParticipants(participants, currentUserId)
    .map((participant) => participant.displayName.trim() || participant.login)
    .filter(Boolean)

  if (names.length === 0) {
    return null
  }

  const verb = variant === "now" ? "is now sharing chat" : "is sharing chat"
  return `This room ${verb} with ${joinEnglishList(names)}.`
}

export function formatSharedChatEndedNotice(): string {
  return "This room is no longer sharing a chat."
}

export function sharedChatParticipantKey(
  participants: SharedChatParticipant[]
): string {
  return [...new Set(participants.map((participant) => participant.userId))]
    .filter(Boolean)
    .sort()
    .join(",")
}

export function sharedChatSessionsEqual(
  left: SharedChatSession | null,
  right: SharedChatSession | null
): boolean {
  if (left === right) {
    return true
  }
  if (!left || !right) {
    return false
  }

  return (
    left.sessionId === right.sessionId &&
    sharedChatParticipantKey(left.participants) ===
      sharedChatParticipantKey(right.participants)
  )
}
