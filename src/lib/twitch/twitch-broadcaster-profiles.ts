import {
  fetchTwitchUsersById,
  fetchTwitchUsersByLogin,
  type TwitchUser,
} from "@/lib/twitch/twitch-api"

export type BroadcasterProfileHint = {
  login: string
  displayName?: string
  profileImageUrl?: string
}

export type BroadcasterProfileAuth = {
  accessToken: string
  clientId: string
}

let sessionKey: string | null = null
const byId = new Map<string, TwitchUser>()
const byLogin = new Map<string, TwitchUser>()
let flushPromise: Promise<void> | null = null
const pendingLogins = new Set<string>()
const pendingIds = new Set<string>()

function authKey(auth: BroadcasterProfileAuth) {
  return auth.clientId
}

function normalizeLogin(login: string) {
  return login.trim().replace(/^#/, "").toLowerCase()
}

export function clearBroadcasterProfileCache() {
  sessionKey = null
  byId.clear()
  byLogin.clear()
  flushPromise = null
  pendingLogins.clear()
  pendingIds.clear()
}

function rememberUser(user: TwitchUser) {
  byId.set(user.id, user)
  byLogin.set(user.login.toLowerCase(), user)
}

function queueLookups(logins: string[], ids: string[]) {
  for (const login of logins) {
    const normalized = normalizeLogin(login)
    if (!normalized || byLogin.has(normalized)) {
      continue
    }
    pendingLogins.add(normalized)
  }

  for (const id of ids) {
    const trimmed = id.trim()
    if (!trimmed || byId.has(trimmed)) {
      continue
    }
    pendingIds.add(trimmed)
  }
}

function scheduleProfileFlush(auth: BroadcasterProfileAuth): Promise<void> {
  const key = authKey(auth)
  if (sessionKey !== key) {
    clearBroadcasterProfileCache()
    sessionKey = key
  }

  if (flushPromise) {
    return flushPromise
  }

  flushPromise = (async () => {
    while (pendingLogins.size > 0 || pendingIds.size > 0) {
      const logins = [...pendingLogins]
      const ids = [...pendingIds]
      pendingLogins.clear()
      pendingIds.clear()

      if (logins.length > 0) {
        const users = await fetchTwitchUsersByLogin(
          logins,
          auth.accessToken,
          auth.clientId
        ).catch(() => [] as TwitchUser[])

        for (const user of users) {
          rememberUser(user)
        }
      }

      if (ids.length > 0) {
        const users = await fetchTwitchUsersById(
          ids,
          auth.accessToken,
          auth.clientId
        ).catch(() => [] as TwitchUser[])

        for (const user of users) {
          rememberUser(user)
        }
      }
    }
  })().finally(() => {
    flushPromise = null
  })

  return flushPromise
}

export async function resolveBroadcasterProfiles(options: {
  accessToken: string
  clientId: string
  roomId: string
  channelLogin: string
  hints: BroadcasterProfileHint[]
  ownerIds: string[]
}): Promise<Map<string, TwitchUser>> {
  const auth: BroadcasterProfileAuth = {
    accessToken: options.accessToken,
    clientId: options.clientId,
  }

  const logins = [
    options.channelLogin,
    ...options.hints.map((hint) => hint.login),
  ]

  queueLookups(logins, options.ownerIds)
  await scheduleProfileFlush(auth)

  const profiles = new Map<string, TwitchUser>()

  for (const user of byId.values()) {
    profiles.set(user.id, user)
  }

  const channelLogin = normalizeLogin(options.channelLogin)
  const currentByLogin =
    byLogin.get(channelLogin) ??
    [...profiles.values()].find((user) => user.login === channelLogin)

  if (currentByLogin) {
    profiles.set(options.roomId, currentByLogin)
  }

  return profiles
}
