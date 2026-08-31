import type { ChannelChatter } from "@/lib/chat/chatter-store"
import type {
  TwitchChatMessage,
  TwitchNoticeActor,
} from "@/lib/twitch/twitch-chat"
import type { TwitchUser } from "@/lib/twitch/twitch-api"

export type UserCardTarget = {
  userId: string | null
  userName: string
  displayName: string
  color: string | null
  flags: TwitchChatMessage["flags"]
  channelLogin?: string
}

export function userCardTargetKey(target: UserCardTarget): string {
  if (target.userId) {
    return `id:${target.userId}`
  }
  return `login:${target.userName.toLowerCase()}`
}

export function createEmptyUserCardFlags(): TwitchChatMessage["flags"] {
  return {
    isBroadcaster: false,
    isModerator: false,
    isSubscriber: false,
    isVip: false,
    isFirst: false,
    isAction: false,
  }
}

export function createUserCardTargetFromNoticeActor(
  actor: TwitchNoticeActor,
  channelLogin?: string
): UserCardTarget {
  return {
    userId: actor.userId,
    userName: actor.userName,
    displayName: actor.displayName,
    color: actor.color,
    flags: createEmptyUserCardFlags(),
    channelLogin,
  }
}

export function createUserCardTargetFromTwitchUser(
  user: TwitchUser,
  channelLogin: string
): UserCardTarget {
  return {
    userId: user.id,
    userName: user.login,
    displayName: user.displayName,
    color: null,
    flags: {
      ...createEmptyUserCardFlags(),
      isBroadcaster: user.login.toLowerCase() === channelLogin.toLowerCase(),
    },
  }
}

export function createUserCardTargetFromChatter(
  chatter: ChannelChatter,
  channelLogin: string
): UserCardTarget {
  return {
    userId: chatter.userId,
    userName: chatter.login,
    displayName: chatter.displayName,
    color: chatter.color,
    flags: chatter.flags,
    channelLogin,
  }
}

export function twitchChannelUrl(login: string): string {
  return `https://www.twitch.tv/${encodeURIComponent(login)}`
}
