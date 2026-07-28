import type { TwitchEventSubDesiredSubscription } from "@/lib/twitch/twitch-eventsub"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import type { TwitchSelfChatState } from "@/lib/twitch/twitch-chat-types"
import { actorCanModerate } from "@/lib/chat/moderation-permissions"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"

export type EventSubChannelTarget = {
  login: string
  roomId: string
}

function hasScope(account: TwitchAccount, scope: string): boolean {
  return account.scopes.includes(scope)
}

function hasChannelModerateScopes(account: TwitchAccount): boolean {
  const blockedTerms =
    hasScope(account, "moderator:read:blocked_terms") ||
    hasScope(account, "moderator:manage:blocked_terms")
  const chatSettings =
    hasScope(account, "moderator:read:chat_settings") ||
    hasScope(account, "moderator:manage:chat_settings")
  const unbanRequests =
    hasScope(account, "moderator:read:unban_requests") ||
    hasScope(account, "moderator:manage:unban_requests")
  const bannedUsers =
    hasScope(account, "moderator:read:banned_users") ||
    hasScope(account, "moderator:manage:banned_users")
  const chatMessages =
    hasScope(account, "moderator:read:chat_messages") ||
    hasScope(account, "moderator:manage:chat_messages")
  const warnings =
    hasScope(account, "moderator:read:warnings") ||
    hasScope(account, "moderator:manage:warnings")
  return (
    blockedTerms &&
    chatSettings &&
    unbanRequests &&
    bannedUsers &&
    chatMessages &&
    hasScope(account, "moderator:read:moderators") &&
    hasScope(account, "moderator:read:vips") &&
    warnings
  )
}

function pushSub(
  out: TwitchEventSubDesiredSubscription[],
  type: string,
  version: string,
  condition: Record<string, string>,
  channelLogin: string
) {
  out.push({
    type,
    version,
    condition,
    channelLogin: normalizeChannelLogin(channelLogin),
  })
}

export function buildDesiredEventSubSubscriptions({
  account,
  channels,
  selfStates,
  showSuspiciousActivity = true,
  showChannelUpdates = true,
}: {
  account: TwitchAccount
  channels: EventSubChannelTarget[]
  selfStates: Map<string, TwitchSelfChatState>
  showSuspiciousActivity?: boolean
  showChannelUpdates?: boolean
}): TwitchEventSubDesiredSubscription[] {
  const out: TwitchEventSubDesiredSubscription[] = []
  const moderatorUserId = account.id

  for (const channel of channels) {
    const login = normalizeChannelLogin(channel.login)
    const broadcasterUserId = channel.roomId.trim()
    if (!login || !broadcasterUserId) continue

    const selfState = selfStates.get(login) ?? null
    const canModerate = actorCanModerate(
      account,
      broadcasterUserId,
      selfState,
      login
    )

    if (showChannelUpdates) {
      pushSub(
        out,
        "channel.update",
        "2",
        {
          broadcaster_user_id: broadcasterUserId,
        },
        login
      )
    }

    if (hasScope(account, "user:read:chat")) {
      pushSub(
        out,
        "channel.chat.user_message_hold",
        "1",
        {
          broadcaster_user_id: broadcasterUserId,
          user_id: moderatorUserId,
        },
        login
      )
      pushSub(
        out,
        "channel.chat.user_message_update",
        "1",
        {
          broadcaster_user_id: broadcasterUserId,
          user_id: moderatorUserId,
        },
        login
      )
    }

    if (!canModerate) {
      continue
    }

    if (hasChannelModerateScopes(account)) {
      pushSub(
        out,
        "channel.moderate",
        "2",
        {
          broadcaster_user_id: broadcasterUserId,
          moderator_user_id: moderatorUserId,
        },
        login
      )
    }

    if (hasScope(account, "moderator:manage:automod")) {
      pushSub(
        out,
        "automod.message.hold",
        "2",
        {
          broadcaster_user_id: broadcasterUserId,
          moderator_user_id: moderatorUserId,
        },
        login
      )
      pushSub(
        out,
        "automod.message.update",
        "2",
        {
          broadcaster_user_id: broadcasterUserId,
          moderator_user_id: moderatorUserId,
        },
        login
      )
    }

    if (
      showSuspiciousActivity &&
      hasScope(account, "moderator:read:suspicious_users")
    ) {
      pushSub(
        out,
        "channel.suspicious_user.message",
        "1",
        {
          broadcaster_user_id: broadcasterUserId,
          moderator_user_id: moderatorUserId,
        },
        login
      )
      pushSub(
        out,
        "channel.suspicious_user.update",
        "1",
        {
          broadcaster_user_id: broadcasterUserId,
          moderator_user_id: moderatorUserId,
        },
        login
      )
    }
  }

  return out
}
