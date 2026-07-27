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
  actor: TwitchNoticeActor
): UserCardTarget {
  return {
    userId: actor.userId,
    userName: actor.userName,
    displayName: actor.displayName,
    color: actor.color,
    flags: createEmptyUserCardFlags(),
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

export function createUserCardTargetFromLogin(
  login: string,
  channelLogin: string
): UserCardTarget {
  const normalized = login.replace(/^@/, "").trim()
  return {
    userId: null,
    userName: normalized,
    displayName: normalized,
    color: null,
    flags: {
      ...createEmptyUserCardFlags(),
      isBroadcaster: normalized.toLowerCase() === channelLogin.toLowerCase(),
    },
  }
}

export function twitchChannelUrl(login: string): string {
  return `https://www.twitch.tv/${encodeURIComponent(login)}`
}
