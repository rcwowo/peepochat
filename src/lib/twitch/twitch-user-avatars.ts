import { fetchTwitchUsersByLogin } from "@/lib/twitch/twitch-api"

const AVATAR_FLUSH_MS = 32
const AVATAR_CHUNK_SIZE = 100

const avatarCache = new Map<string, string | null>()
const avatarInflight = new Map<string, Promise<string | null>>()
const queuedLogins = new Set<string>()
const queuedResolvers = new Map<string, Array<(url: string | null) => void>>()

let flushTimer: ReturnType<typeof setTimeout> | null = null
let queuedAuth: { accessToken: string; clientId: string } | null = null
const listeners = new Set<() => void>()

function notifyListeners() {
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeToUserAvatars(onStoreChange: () => void) {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

export function getCachedUserAvatarUrl(
  login: string
): string | null | undefined {
  const key = login.trim().replace(/^#/, "").toLowerCase()
  if (!key) {
    return null
  }
  return avatarCache.has(key) ? avatarCache.get(key) : undefined
}

export function fetchUserAvatarUrl(
  login: string,
  accessToken: string,
  clientId: string
): Promise<string | null> {
  const key = login.trim().replace(/^#/, "").toLowerCase()
  if (!key) {
    return Promise.resolve(null)
  }

  if (avatarCache.has(key)) {
    return Promise.resolve(avatarCache.get(key) ?? null)
  }

  const existing = avatarInflight.get(key)
  if (existing) {
    return existing
  }

  const promise = new Promise<string | null>((resolve) => {
    const waiters = queuedResolvers.get(key)
    if (waiters) {
      waiters.push(resolve)
    } else {
      queuedResolvers.set(key, [resolve])
    }
    queuedLogins.add(key)
    queuedAuth = { accessToken, clientId }
    if (flushTimer === null) {
      flushTimer = setTimeout(flushQueuedAvatars, AVATAR_FLUSH_MS)
    }
  })

  avatarInflight.set(key, promise)
  return promise
}

async function flushQueuedAvatars() {
  flushTimer = null
  const auth = queuedAuth
  const logins = [...queuedLogins]
  queuedLogins.clear()
  queuedAuth = null

  if (!auth || logins.length === 0) {
    return
  }

  const found = new Map<string, string>()

  try {
    for (let index = 0; index < logins.length; index += AVATAR_CHUNK_SIZE) {
      const chunk = logins.slice(index, index + AVATAR_CHUNK_SIZE)
      const users = await fetchTwitchUsersByLogin(
        chunk,
        auth.accessToken,
        auth.clientId
      )
      for (const user of users) {
        const url = user.profileImageUrl.trim()
        if (url) {
          found.set(user.login.toLowerCase(), url)
        }
      }
    }

    for (const login of logins) {
      settleAvatar(login, found.get(login) ?? null)
    }
  } catch {
    for (const login of logins) {
      failAvatar(login)
    }
  }
}

function settleAvatar(login: string, url: string | null) {
  avatarCache.set(login, url)
  avatarInflight.delete(login)
  const waiters = queuedResolvers.get(login)
  queuedResolvers.delete(login)
  if (waiters) {
    for (const resolve of waiters) {
      resolve(url)
    }
  }
  notifyListeners()
}

function failAvatar(login: string) {
  avatarInflight.delete(login)
  const waiters = queuedResolvers.get(login)
  queuedResolvers.delete(login)
  if (!waiters) {
    return
  }
  for (const resolve of waiters) {
    resolve(null)
  }
}
