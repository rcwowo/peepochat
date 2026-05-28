import {
  fetchAllUserChatEmotes,
  fetchChannelChatEmotes,
  fetchGlobalChatEmotes,
  type TwitchChatEmote,
} from "@/lib/twitch-api"

export type TwitchEmoteSessionAuth = {
  accessToken: string
  clientId: string
  userId: string
}

type SessionSharedEmotes = {
  global: TwitchChatEmote[]
  userAll: TwitchChatEmote[]
}

type SessionChannelEmotes = {
  channel: TwitchChatEmote[]
}

let sessionKey: string | null = null
let sharedCache: SessionSharedEmotes | null = null
const channelCache = new Map<string, SessionChannelEmotes>()
const sharedInflight = new Map<string, Promise<SessionSharedEmotes>>()
const channelInflight = new Map<string, Promise<SessionChannelEmotes>>()

function authKey(auth: TwitchEmoteSessionAuth) {
  return `${auth.clientId}:${auth.userId}`
}

function canUseSession(auth: TwitchEmoteSessionAuth | null | undefined): auth is TwitchEmoteSessionAuth {
  return Boolean(auth?.accessToken?.trim() && auth?.clientId?.trim() && auth?.userId?.trim())
}

function ensureSessionKey(key: string) {
  if (sessionKey === key) {
    return
  }

  clearTwitchEmoteSessionCache()
  sessionKey = key
}

/** Drop cached Helix emote responses (e.g. logout or token / user change). */
export function clearTwitchEmoteSessionCache() {
  sessionKey = null
  sharedCache = null
  channelCache.clear()
  sharedInflight.clear()
  channelInflight.clear()
}

function clearChannelInflightForRoom(roomId: string) {
  const suffix = `:${roomId}`
  for (const key of channelInflight.keys()) {
    if (key.endsWith(suffix)) {
      channelInflight.delete(key)
    }
  }
}

/** Drop per-channel Helix emote cache; shared global / user lists are kept. */
export function clearChannelTwitchEmoteCache(roomId?: string) {
  if (roomId) {
    channelCache.delete(roomId)
    clearChannelInflightForRoom(roomId)
    return
  }

  channelCache.clear()
  channelInflight.clear()
}

export async function loadSharedTwitchEmotes(
  auth: TwitchEmoteSessionAuth
): Promise<SessionSharedEmotes> {
  const key = authKey(auth)
  ensureSessionKey(key)

  if (sharedCache) {
    return sharedCache
  }

  const inflightKey = `shared:${key}`
  const pending = sharedInflight.get(inflightKey)
  if (pending) {
    return pending
  }

  const promise = Promise.all([
    fetchGlobalChatEmotes(auth.accessToken, auth.clientId).catch(() => []),
    fetchAllUserChatEmotes(auth.userId, auth.accessToken, auth.clientId).catch(
      () => []
    ),
  ]).then(([global, userAll]) => {
    const result = { global, userAll }
    sharedCache = result
    sharedInflight.delete(inflightKey)
    return result
  })

  sharedInflight.set(
    inflightKey,
    promise.catch((error) => {
      sharedInflight.delete(inflightKey)
      throw error
    })
  )

  return promise
}

export async function loadChannelTwitchEmotes(
  auth: TwitchEmoteSessionAuth,
  roomId: string
): Promise<SessionChannelEmotes> {
  const key = authKey(auth)
  ensureSessionKey(key)

  const cached = channelCache.get(roomId)
  if (cached) {
    return cached
  }

  const inflightKey = `channel:${key}:${roomId}`
  const pending = channelInflight.get(inflightKey)
  if (pending) {
    return pending
  }

  const promise = fetchChannelChatEmotes(
    roomId,
    auth.accessToken,
    auth.clientId
  )
    .catch(() => [] as TwitchChatEmote[])
    .then((channel) => {
      const result = { channel }
      channelCache.set(roomId, result)
      channelInflight.delete(inflightKey)
      return result
    })

  channelInflight.set(
    inflightKey,
    promise.catch((error) => {
      channelInflight.delete(inflightKey)
      throw error
    })
  )

  return promise
}

export async function loadTwitchEmotesForComposer(options: {
  roomId: string
  accessToken?: string
  clientId?: string
  userId?: string
}): Promise<{
  global: TwitchChatEmote[]
  userAll: TwitchChatEmote[]
  channel: TwitchChatEmote[]
  userChannel: TwitchChatEmote[]
}> {
  const auth: TwitchEmoteSessionAuth | null = canUseSession({
    accessToken: options.accessToken ?? "",
    clientId: options.clientId ?? "",
    userId: options.userId ?? "",
  })
    ? {
        accessToken: options.accessToken!.trim(),
        clientId: options.clientId!.trim(),
        userId: options.userId!.trim(),
      }
    : null

  if (!auth) {
    return { global: [], userAll: [], channel: [], userChannel: [] }
  }

  const [shared, channel] = await Promise.all([
    loadSharedTwitchEmotes(auth),
    loadChannelTwitchEmotes(auth, options.roomId),
  ])

  return {
    global: shared.global,
    userAll: shared.userAll,
    channel: channel.channel,
    /** Full user emote list; channel-specific picker sections filter from this. */
    userChannel: shared.userAll,
  }
}
