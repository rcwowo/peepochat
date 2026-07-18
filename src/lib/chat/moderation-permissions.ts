import { CHAT_COMMAND_SCOPES } from "@/lib/chat/chat-command-scopes"
import type { TwitchSelfChatState } from "@/lib/twitch/twitch-chat-types"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"

export function hasModerationScope(
  account: TwitchAccount | null,
  scope: string
): boolean {
  return Boolean(account?.scopes?.includes(scope))
}

export function actorIsBroadcaster(
  account: TwitchAccount | null,
  broadcasterId: string | null
): boolean {
  return Boolean(account && broadcasterId && account.id === broadcasterId)
}

export function actorIsBroadcasterInChannel({
  account,
  broadcasterId,
  channelLogin,
  selfState,
}: {
  account: TwitchAccount | null
  broadcasterId: string | null
  channelLogin?: string | null
  selfState?: TwitchSelfChatState | null
}): boolean {
  if (!account) {
    return false
  }

  return (
    actorIsBroadcaster(account, broadcasterId) ||
    Boolean(selfState?.isBroadcaster) ||
    Boolean(
      channelLogin && account.login.toLowerCase() === channelLogin.toLowerCase()
    )
  )
}

export function actorCanModerate(
  account: TwitchAccount | null,
  broadcasterId: string | null,
  selfState: TwitchSelfChatState | null,
  channelLogin?: string | null
): boolean {
  if (!account) {
    return false
  }

  const isBroadcaster =
    actorIsBroadcaster(account, broadcasterId) ||
    Boolean(selfState?.isBroadcaster) ||
    Boolean(
      channelLogin && account.login.toLowerCase() === channelLogin.toLowerCase()
    )

  return isBroadcaster || Boolean(selfState?.isModerator)
}

export function canDeleteChatMessages(account: TwitchAccount | null): boolean {
  return hasModerationScope(account, CHAT_COMMAND_SCOPES.chatMessages)
}

export function canBanOrTimeoutUsers(account: TwitchAccount | null): boolean {
  return hasModerationScope(account, CHAT_COMMAND_SCOPES.bannedUsers)
}

export function canManageModerators(account: TwitchAccount | null): boolean {
  return hasModerationScope(account, CHAT_COMMAND_SCOPES.moderators)
}

export function canManageVips(account: TwitchAccount | null): boolean {
  return hasModerationScope(account, CHAT_COMMAND_SCOPES.vips)
}

export type ModerationTarget = {
  userId: string | null
  userName: string
  isBroadcaster?: boolean
  isModerator?: boolean
}

export function canModerateTarget({
  account,
  broadcasterId,
  channelLogin,
  selfState,
  target,
}: {
  account: TwitchAccount | null
  broadcasterId: string | null
  channelLogin: string
  selfState: TwitchSelfChatState | null
  target: ModerationTarget
}): boolean {
  if (!canBanOrTimeoutUsers(account)) {
    return false
  }
  if (!actorCanModerate(account, broadcasterId, selfState)) {
    return false
  }
  if (!account || !broadcasterId) {
    return false
  }

  const isSelf =
    (target.userId && account.id === target.userId) ||
    account.login.toLowerCase() === target.userName.toLowerCase()
  if (isSelf) {
    return false
  }

  const isTargetBroadcaster =
    target.isBroadcaster ||
    (target.userId && target.userId === broadcasterId) ||
    target.userName.toLowerCase() === channelLogin.toLowerCase()
  if (isTargetBroadcaster) {
    return false
  }

  return (
    actorIsBroadcaster(account, broadcasterId) ||
    (Boolean(selfState?.isModerator) && !target.isModerator)
  )
}

export function canDeleteMessageInChannel({
  account,
  broadcasterId,
  channelLogin,
  selfState,
}: {
  account: TwitchAccount | null
  broadcasterId: string | null
  channelLogin?: string | null
  selfState: TwitchSelfChatState | null
}): boolean {
  return (
    canDeleteChatMessages(account) &&
    actorCanModerate(account, broadcasterId, selfState, channelLogin)
  )
}
