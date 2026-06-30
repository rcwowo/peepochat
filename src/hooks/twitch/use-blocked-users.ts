import * as React from "react"

import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import { isBlockedUser } from "@/lib/twitch/blocked-users"
import {
  blockTwitchUser,
  fetchTwitchBlockedUsers,
  unblockTwitchUser,
} from "@/lib/twitch/twitch-api"

const BLOCKED_USERS_READ_SCOPE = "user:read:blocked_users"
const BLOCKED_USERS_MANAGE_SCOPE = "user:manage:blocked_users"

export function hasBlockedUsersReadScope(
  account: TwitchAccount | null
): boolean {
  return Boolean(account?.scopes?.includes(BLOCKED_USERS_READ_SCOPE))
}

export function hasBlockedUsersManageScope(
  account: TwitchAccount | null
): boolean {
  return Boolean(account?.scopes?.includes(BLOCKED_USERS_MANAGE_SCOPE))
}

type BlockedUsersState = {
  userIds: string[]
  userLogins: string[]
}

const EMPTY_BLOCKED_USERS: BlockedUsersState = {
  userIds: [],
  userLogins: [],
}

function toBlockedUsersState(
  users: Array<{ userId: string; userLogin: string }>
): BlockedUsersState {
  return {
    userIds: users.map((user) => user.userId),
    userLogins: users.map((user) => user.userLogin.toLowerCase()),
  }
}

export function useBlockedUsers(account: TwitchAccount | null) {
  const [loadedBlockedUsers, setLoadedBlockedUsers] = React.useState<{
    accountId: string
    users: BlockedUsersState
  } | null>(null)

  const blockedUsers =
    account &&
    hasBlockedUsersReadScope(account) &&
    loadedBlockedUsers?.accountId === account.id
      ? loadedBlockedUsers.users
      : EMPTY_BLOCKED_USERS

  const blockedIds = React.useMemo(
    () => new Set(blockedUsers.userIds),
    [blockedUsers.userIds]
  )
  const blockedLogins = React.useMemo(
    () => new Set(blockedUsers.userLogins),
    [blockedUsers.userLogins]
  )

  const isBlocked = React.useCallback(
    (userId?: string | null, login?: string | null) => {
      return isBlockedUser(blockedIds, blockedLogins, userId, login)
    },
    [blockedIds, blockedLogins]
  )

  React.useEffect(() => {
    if (!account || !hasBlockedUsersReadScope(account)) {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const users = await fetchTwitchBlockedUsers({
          broadcasterId: account.id,
          accessToken: account.accessToken,
          clientId: account.clientId,
        })
        if (!cancelled) {
          setLoadedBlockedUsers({
            accountId: account.id,
            users: toBlockedUsersState(users),
          })
        }
      } catch {
        if (!cancelled) {
          setLoadedBlockedUsers({
            accountId: account.id,
            users: EMPTY_BLOCKED_USERS,
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [account])

  const blockUser = React.useCallback(
    async (userId: string, login: string) => {
      if (!account) {
        throw new Error("Sign in with Twitch to block users.")
      }
      if (!hasBlockedUsersManageScope(account)) {
        throw new Error(
          `Missing permission (${BLOCKED_USERS_MANAGE_SCOPE}). Sign out and sign back in to grant updated scopes.`
        )
      }

      await blockTwitchUser({
        broadcasterId: account.id,
        userId,
        accessToken: account.accessToken,
        clientId: account.clientId,
      })
      setLoadedBlockedUsers((current) => {
        const users =
          current?.accountId === account.id
            ? current.users
            : EMPTY_BLOCKED_USERS

        return {
          accountId: account.id,
          users: {
            userIds: users.userIds.includes(userId)
              ? users.userIds
              : [...users.userIds, userId],
            userLogins: users.userLogins.includes(login.toLowerCase())
              ? users.userLogins
              : [...users.userLogins, login.toLowerCase()],
          },
        }
      })
    },
    [account]
  )

  const unblockUser = React.useCallback(
    async (userId: string, login?: string) => {
      if (!account) {
        throw new Error("Sign in with Twitch to unblock users.")
      }
      if (!hasBlockedUsersManageScope(account)) {
        throw new Error(
          `Missing permission (${BLOCKED_USERS_MANAGE_SCOPE}). Sign out and sign back in to grant updated scopes.`
        )
      }

      await unblockTwitchUser({
        broadcasterId: account.id,
        userId,
        accessToken: account.accessToken,
        clientId: account.clientId,
      })
      const normalizedLogin = login?.toLowerCase()
      setLoadedBlockedUsers((current) => {
        if (current?.accountId !== account.id) {
          return current
        }

        return {
          accountId: account.id,
          users: {
            userIds: current.users.userIds.filter((id) => id !== userId),
            userLogins: normalizedLogin
              ? current.users.userLogins.filter(
                  (value) => value !== normalizedLogin
                )
              : current.users.userLogins,
          },
        }
      })
    },
    [account]
  )

  return {
    isBlocked,
    blockUser,
    unblockUser,
  }
}
