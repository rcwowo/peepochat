import type { TwitchChatReply } from "@/lib/twitch/twitch-chat"

export const BLOCKED_USER_DISPLAY_NAME = "Blocked User"

export function isBlockedUser(
  blockedIds: ReadonlySet<string>,
  blockedLogins: ReadonlySet<string>,
  userId?: string | null,
  login?: string | null
): boolean {
  if (userId && blockedIds.has(userId)) {
    return true
  }

  const normalizedLogin = login?.replace(/^@/, "").trim().toLowerCase()
  return Boolean(normalizedLogin && blockedLogins.has(normalizedLogin))
}

export function maskReplyForBlockedUser(
  reply: TwitchChatReply
): TwitchChatReply {
  return {
    ...reply,
    parentDisplayName: BLOCKED_USER_DISPLAY_NAME,
    parentColor: null,
  }
}
