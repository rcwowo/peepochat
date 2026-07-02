import {
  fetchTwitchUsersById,
  fetchTwitchUsersByLogin,
  type TwitchUser,
} from "@/lib/twitch/twitch-api"

export type BroadcasterProfileHint = {
  login: string
  displayName?: string
  profileImageUrl?: string
  roomId?: string
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

function hasAuth(auth: BroadcasterProfileAuth) {
  return Boolean(auth.accessToken.trim() && auth.clientId.trim())
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

function userFromHint(
  hint: BroadcasterProfileHint,
  id?: string
): TwitchUser | null {
  const login = normalizeLogin(hint.login)
  if (!login) {
    return null
  }

  const profileImageUrl = hint.profileImageUrl?.trim() ?? ""
  if (!profileImageUrl) {
    return null
  }

  return {
    id: id?.trim() || hint.roomId?.trim() || `hint:${login}`,
    login,
    displayName: hint.displayName?.trim() || login,
    profileImageUrl,
    bannerImageUrl: "",
    description: "",
    createdAt: "",
    broadcasterType: "",
    type: "",
  }
}

function seedProfileHints(hints: BroadcasterProfileHint[]) {
  for (const hint of hints) {
    const synthetic = userFromHint(hint, hint.roomId)
    if (!synthetic) {
      continue
    }

    const existingByLogin = byLogin.get(synthetic.login)
    if (existingByLogin) {
      if (!existingByLogin.profileImageUrl.trim()) {
        rememberUser({
          ...existingByLogin,
          profileImageUrl: synthetic.profileImageUrl,
        })
      }
      continue
    }

    if (hint.roomId?.trim()) {
      const existingById = byId.get(hint.roomId.trim())
      if (existingById?.profileImageUrl.trim()) {
        continue
      }
    }

    rememberUser(synthetic)
  }
}

function queueLookups(logins: string[], ids: string[]) {
  for (const login of logins) {
    const normalized = normalizeLogin(login)
    if (!normalized) {
      continue
    }

    const cached = byLogin.get(normalized)
    if (cached?.profileImageUrl.trim()) {
      continue
    }

    pendingLogins.add(normalized)
  }

  for (const id of ids) {
    const trimmed = id.trim()
    if (!trimmed) {
      continue
    }

    const cached = byId.get(trimmed)
    if (cached?.profileImageUrl.trim()) {
      continue
    }

    pendingIds.add(trimmed)
  }
}

function scheduleProfileFlush(auth: BroadcasterProfileAuth): Promise<void> {
  if (flushPromise) {
    return flushPromise
  }

  flushPromise = (async () => {
    while (pendingLogins.size > 0 || pendingIds.size > 0) {
      const logins = [...pendingLogins]
      const ids = [...pendingIds]
      pendingLogins.clear()
      pendingIds.clear()

      const [loginUsers, idUsers] = await Promise.all([
        logins.length > 0
          ? fetchTwitchUsersByLogin(
              logins,
              auth.accessToken,
              auth.clientId
            ).catch(() => [] as TwitchUser[])
          : Promise.resolve([] as TwitchUser[]),
        ids.length > 0
          ? fetchTwitchUsersById(ids, auth.accessToken, auth.clientId).catch(
              () => [] as TwitchUser[]
            )
          : Promise.resolve([] as TwitchUser[]),
      ])

      for (const user of [...loginUsers, ...idUsers]) {
        rememberUser(user)
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

  if (hasAuth(auth)) {
    const key = authKey(auth)
    if (sessionKey !== key) {
      clearBroadcasterProfileCache()
      sessionKey = key
    }
  }

  seedProfileHints(options.hints)

  const logins = [
    options.channelLogin,
    ...options.hints.map((hint) => hint.login),
  ]

  queueLookups(logins, options.ownerIds)

  if (hasAuth(auth) && (pendingLogins.size > 0 || pendingIds.size > 0)) {
    await scheduleProfileFlush(auth)
  }

  const profiles = new Map<string, TwitchUser>()

  for (const user of byId.values()) {
    profiles.set(user.id, user)
  }

  const channelLogin = normalizeLogin(options.channelLogin)
  let currentByLogin =
    byLogin.get(channelLogin) ??
    [...profiles.values()].find((user) => user.login === channelLogin)

  if (!currentByLogin?.profileImageUrl.trim()) {
    const channelHint = options.hints.find(
      (hint) => normalizeLogin(hint.login) === channelLogin
    )
    const fromHint = channelHint
      ? userFromHint(channelHint, options.roomId)
      : null
    if (fromHint) {
      currentByLogin = fromHint
      rememberUser(fromHint)
    }
  }

  if (currentByLogin) {
    profiles.set(options.roomId, currentByLogin)
  }

  return profiles
}
