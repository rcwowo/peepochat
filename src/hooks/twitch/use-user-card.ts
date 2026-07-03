import * as React from "react"

import { actorIsBroadcasterInChannel } from "@/lib/chat/moderation-permissions"
import {
  fetchIvrTwitchModVip,
  fetchIvrTwitchSubage,
  fetchIvrTwitchUserProfile,
  IvrApiError,
  type IvrTwitchSubage,
  type IvrTwitchUserProfile,
} from "@/lib/ivr/ivr-api"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import {
  banTwitchUser,
  fetchTwitchModeratorStatus,
  fetchTwitchUsersById,
  fetchTwitchUsersByLogin,
  fetchTwitchVipStatus,
  setTwitchModeratorStatus,
  setTwitchVipStatus,
  TwitchApiError,
  type TwitchModeratorStatus,
  type TwitchUser,
  type TwitchVipStatus,
  unbanTwitchUser,
} from "@/lib/twitch/twitch-api"
import type { TwitchSelfChatState } from "@/hooks/twitch/use-twitch-chat"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"

const PROFILE_TTL_MS = 10 * 60 * 1000
const STATUS_TTL_MS = 30 * 1000
const DEFAULT_TIMEOUT_DURATION_SECONDS = 10 * 60

export const USER_CARD_MODERATION_SCOPES = {
  moderationRead: "moderation:read",
  manageModerators: "channel:manage:moderators",
  manageVips: "channel:manage:vips",
} as const

export type UserCardTarget = {
  userId: string | null
  userName: string
  displayName: string
  color: string | null
  flags: TwitchChatMessage["flags"]
}

export type UserCardChannelRoles = {
  isModerator: boolean
  isVip: boolean
}

export type UserCardChannelStatus = {
  moderator: StatusResult<TwitchModeratorStatus | null>
  vip: StatusResult<TwitchVipStatus | null>
  channelRoles: StatusResult<UserCardChannelRoles>
  subage: StatusResult<IvrTwitchSubage | null>
  ivrProfile: StatusResult<IvrTwitchUserProfile | null>
}

export type UserCardAction =
  | "ban"
  | "pardon"
  | "timeout"
  | "mod"
  | "unmod"
  | "vip"
  | "unvip"

type StatusResult<T> =
  | { state: "available"; value: T }
  | { state: "unavailable"; reason: string }

type UserCardState =
  | { status: "idle"; profile: null; channelStatus: null; error: null }
  | {
      status: "loading"
      profile: TwitchUser | null
      channelStatus: null
      error: null
    }
  | {
      status: "ready"
      profile: TwitchUser
      channelStatus: UserCardChannelStatus
      error: null
    }
  | { status: "error"; profile: null; channelStatus: null; error: string }

type CachedValue<T> = {
  value: T
  cachedAt: number
}

const profileCache = new Map<string, CachedValue<TwitchUser>>()
const profileInflight = new Map<string, Promise<TwitchUser>>()
const statusCache = new Map<string, CachedValue<UserCardChannelStatus>>()
const statusInflight = new Map<string, Promise<UserCardChannelStatus>>()

function hasScope(account: TwitchAccount | null, scope: string) {
  return Boolean(account?.scopes?.includes(scope))
}

export function hasUserCardScope(account: TwitchAccount | null, scope: string) {
  return hasScope(account, scope)
}

function isFresh(cachedAt: number, ttlMs: number) {
  return Date.now() - cachedAt < ttlMs
}

function profileCacheKeys(target: UserCardTarget) {
  const keys = [`login:${target.userName.toLowerCase()}`]
  if (target.userId) {
    keys.unshift(`id:${target.userId}`)
  }
  return keys
}

function rememberProfile(user: TwitchUser) {
  const cached = { value: user, cachedAt: Date.now() }
  profileCache.set(`id:${user.id}`, cached)
  profileCache.set(`login:${user.login.toLowerCase()}`, cached)
}

async function loadUserProfile(
  target: UserCardTarget,
  account: TwitchAccount
): Promise<TwitchUser> {
  const keys = profileCacheKeys(target)
  for (const key of keys) {
    const cached = profileCache.get(key)
    if (cached && isFresh(cached.cachedAt, PROFILE_TTL_MS)) {
      return cached.value
    }
  }

  for (const key of keys) {
    const inflight = profileInflight.get(key)
    if (inflight) {
      return inflight
    }
  }

  const request = (async () => {
    const users = target.userId
      ? await fetchTwitchUsersById(
          [target.userId],
          account.accessToken,
          account.clientId
        )
      : await fetchTwitchUsersByLogin(
          [target.userName],
          account.accessToken,
          account.clientId
        )
    const profile = users[0]
    if (!profile) {
      throw new TwitchApiError("Twitch user profile was not found.", 404)
    }
    rememberProfile(profile)
    return profile
  })().finally(() => {
    for (const key of keys) {
      if (profileInflight.get(key) === request) {
        profileInflight.delete(key)
      }
    }
  })

  for (const key of keys) {
    profileInflight.set(key, request)
  }
  return request
}

function statusCacheKey({
  account,
  channelRoomId,
  channelLogin,
  userId,
}: {
  account: TwitchAccount
  channelRoomId: string | null
  channelLogin: string
  userId: string
}) {
  return `${account.id}:${channelRoomId ?? "no-room"}:${channelLogin}:${userId}:${account.scopes.join(",")}`
}

function unavailable(reason: string): StatusResult<never> {
  return { state: "unavailable", reason }
}

async function optionalStatus<T>(
  enabled: boolean,
  reason: string,
  fetcher: () => Promise<T>
): Promise<StatusResult<T>> {
  if (!enabled) {
    return unavailable(reason)
  }

  try {
    return { state: "available", value: await fetcher() }
  } catch (error) {
    if (
      error instanceof TwitchApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      return unavailable("Twitch denied access for this status.")
    }
    if (
      error instanceof IvrApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      return unavailable("IVR denied access for this status.")
    }
    return unavailable(
      error instanceof Error ? error.message : "Status is unavailable."
    )
  }
}

async function loadChannelStatus({
  account,
  channelRoomId,
  channelLogin,
  profile,
  selfChatState,
}: {
  account: TwitchAccount
  channelRoomId: string | null
  channelLogin: string
  profile: TwitchUser
  selfChatState: TwitchSelfChatState | null
}): Promise<UserCardChannelStatus> {
  const key = statusCacheKey({
    account,
    channelRoomId,
    channelLogin,
    userId: profile.id,
  })
  const cached = statusCache.get(key)
  if (cached && isFresh(cached.cachedAt, STATUS_TTL_MS)) {
    return cached.value
  }

  const inflight = statusInflight.get(key)
  if (inflight) {
    return inflight
  }

  const request = (async () => {
    const missingRoomReason = "Channel room ID is not available yet."
    const isBroadcasterInChannel = actorIsBroadcasterInChannel({
      account,
      broadcasterId: channelRoomId,
      channelLogin,
      selfState: selfChatState,
    })
    const canLoadModeratorStatus =
      Boolean(channelRoomId) &&
      isBroadcasterInChannel &&
      (hasScope(account, USER_CARD_MODERATION_SCOPES.moderationRead) ||
        hasScope(account, USER_CARD_MODERATION_SCOPES.manageModerators))
    const canLoadVipStatus =
      Boolean(channelRoomId) &&
      hasScope(account, USER_CARD_MODERATION_SCOPES.manageVips) &&
      account.id === channelRoomId
    const [moderator, vip, channelRoles, subage, ivrProfile] =
      await Promise.all([
        optionalStatus(
          canLoadModeratorStatus,
          channelRoomId
            ? "Moderator status is not available with this token."
            : missingRoomReason,
          () =>
            fetchTwitchModeratorStatus({
              broadcasterId: channelRoomId!,
              userId: profile.id,
              accessToken: account.accessToken,
              clientId: account.clientId,
            })
        ),
        optionalStatus(
          canLoadVipStatus,
          channelRoomId
            ? "VIP status is not available with this token."
            : missingRoomReason,
          () =>
            fetchTwitchVipStatus({
              broadcasterId: channelRoomId!,
              userId: profile.id,
              accessToken: account.accessToken,
              clientId: account.clientId,
            })
        ),
        optionalStatus(true, "Channel roles are unavailable.", async () => {
          const modVip = await fetchIvrTwitchModVip(channelLogin)
          const userId = profile.id
          const userLogin = profile.login.toLowerCase()
          const matchesUser = (entry: { id: string; login: string }) =>
            entry.id === userId || entry.login.toLowerCase() === userLogin

          return {
            isModerator: modVip.mods.some(matchesUser),
            isVip: modVip.vips.some(matchesUser),
          }
        }),
        optionalStatus(true, "Subage is unavailable.", () =>
          fetchIvrTwitchSubage({
            userLogin: profile.login || profile.displayName,
            channelLogin,
          })
        ),
        optionalStatus(true, "IVR profile is unavailable.", () =>
          fetchIvrTwitchUserProfile({
            userLogin: profile.login || profile.displayName,
          })
        ),
      ])
    const status: UserCardChannelStatus = {
      moderator,
      vip,
      channelRoles,
      subage,
      ivrProfile,
    }
    statusCache.set(key, { value: status, cachedAt: Date.now() })
    return status
  })().finally(() => {
    statusInflight.delete(key)
  })

  statusInflight.set(key, request)
  return request
}

function invalidateStatus(
  account: TwitchAccount,
  channelRoomId: string,
  userId: string
) {
  const prefix = `${account.id}:${channelRoomId}:`
  for (const key of statusCache.keys()) {
    if (key.startsWith(prefix) && key.includes(`:${userId}:`)) {
      statusCache.delete(key)
    }
  }
}

function getModerationSelfStateKey(
  selfChatState: TwitchSelfChatState | null
): string | null {
  if (!selfChatState) {
    return null
  }

  return `${selfChatState.channel}:${selfChatState.roomId ?? ""}:${selfChatState.isBroadcaster}:${selfChatState.isModerator}`
}

export function useUserCard({
  open,
  account,
  target,
  channelRoomId,
  channelLogin,
  selfChatState,
}: {
  open: boolean
  account: TwitchAccount | null
  target: UserCardTarget
  channelRoomId: string | null
  channelLogin: string
  selfChatState: TwitchSelfChatState | null
}) {
  const [state, setState] = React.useState<UserCardState>({
    status: "idle",
    profile: null,
    channelStatus: null,
    error: null,
  })
  const [pendingAction, setPendingAction] =
    React.useState<UserCardAction | null>(null)
  const pendingActionRef = React.useRef<UserCardAction | null>(null)
  const requestIdRef = React.useRef(0)
  const selfChatStateRef = React.useRef(selfChatState)
  const moderationSelfStateKey = getModerationSelfStateKey(selfChatState)

  React.useEffect(() => {
    selfChatStateRef.current = selfChatState
  }, [selfChatState])

  const reload = React.useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!open) {
      setState({
        status: "idle",
        profile: null,
        channelStatus: null,
        error: null,
      })
      return
    }
    if (!account) {
      setState({
        status: "error",
        profile: null,
        channelStatus: null,
        error: "Sign in with Twitch to load user details.",
      })
      return
    }

    setState((current) => ({
      status: "loading",
      profile: current.profile,
      channelStatus: null,
      error: null,
    }))

    try {
      const profile = await loadUserProfile(target, account)
      const channelStatus = await loadChannelStatus({
        account,
        channelRoomId,
        channelLogin,
        profile,
        selfChatState,
      })

      if (requestIdRef.current !== requestId) {
        return
      }

      setState({ status: "ready", profile, channelStatus, error: null })
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return
      }
      setState({
        status: "error",
        profile: null,
        channelStatus: null,
        error:
          error instanceof Error
            ? error.message
            : "Could not load user details.",
      })
    }
  }, [account, channelLogin, channelRoomId, open, selfChatState, target])

  React.useEffect(() => {
    if (!open) {
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!account) {
      queueMicrotask(() => {
        if (requestIdRef.current !== requestId) {
          return
        }

        setState({
          status: "error",
          profile: null,
          channelStatus: null,
          error: "Sign in with Twitch to load user details.",
        })
      })
      return
    }

    queueMicrotask(() => {
      if (requestIdRef.current !== requestId) {
        return
      }

      setState((current) => ({
        status: "loading",
        profile: current.profile,
        channelStatus: null,
        error: null,
      }))
    })

    void (async () => {
      try {
        const profile = await loadUserProfile(target, account)
        const channelStatus = await loadChannelStatus({
          account,
          channelRoomId,
          channelLogin,
          profile,
          selfChatState: selfChatStateRef.current,
        })

        if (requestIdRef.current !== requestId) {
          return
        }

        setState({ status: "ready", profile, channelStatus, error: null })
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          return
        }

        setState({
          status: "error",
          profile: null,
          channelStatus: null,
          error:
            error instanceof Error
              ? error.message
              : "Could not load user details.",
        })
      }
    })()
  }, [
    account,
    channelLogin,
    channelRoomId,
    moderationSelfStateKey,
    open,
    target,
  ])

  const runAction = React.useCallback(
    async (
      action: UserCardAction,
      options?: {
        durationSeconds?: number
      }
    ) => {
      if (pendingActionRef.current) {
        throw new Error("Another user action is already in progress.")
      }
      if (!account || !channelRoomId || state.status !== "ready") {
        throw new Error("User action is not available yet.")
      }

      const userId = state.profile.id
      pendingActionRef.current = action
      setPendingAction(action)
      try {
        switch (action) {
          case "ban":
            await banTwitchUser({
              broadcasterId: channelRoomId,
              moderatorId: account.id,
              userId,
              accessToken: account.accessToken,
              clientId: account.clientId,
            })
            break
          case "timeout":
            await banTwitchUser({
              broadcasterId: channelRoomId,
              moderatorId: account.id,
              userId,
              accessToken: account.accessToken,
              clientId: account.clientId,
              durationSeconds:
                options?.durationSeconds ?? DEFAULT_TIMEOUT_DURATION_SECONDS,
            })
            break
          case "pardon":
            try {
              await unbanTwitchUser({
                broadcasterId: channelRoomId,
                moderatorId: account.id,
                userId,
                accessToken: account.accessToken,
                clientId: account.clientId,
              })
            } catch (error) {
              if (!(error instanceof TwitchApiError && error.status === 404)) {
                throw error
              }
            }
            break
          case "mod":
          case "unmod":
            await setTwitchModeratorStatus({
              broadcasterId: channelRoomId,
              userId,
              accessToken: account.accessToken,
              clientId: account.clientId,
              moderated: action === "mod",
            })
            break
          case "vip":
          case "unvip":
            await setTwitchVipStatus({
              broadcasterId: channelRoomId,
              userId,
              accessToken: account.accessToken,
              clientId: account.clientId,
              isVip: action === "vip",
            })
            break
        }

        invalidateStatus(account, channelRoomId, userId)
        await reload()
      } finally {
        pendingActionRef.current = null
        setPendingAction(null)
      }
    },
    [account, channelRoomId, reload, state]
  )

  return {
    ...state,
    pendingAction,
    reload,
    runAction,
  }
}
