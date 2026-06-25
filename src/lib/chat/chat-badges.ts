import {
  fetchChannelChatBadges,
  fetchGlobalChatBadges,
  type TwitchChatBadgeSet,
} from "@/lib/twitch/twitch-api"
import type { TwitchBadge } from "@/lib/twitch/twitch-chat"

const GLOBAL_CACHE_KEY = "peepochat::badges::global"
const CHANNEL_CACHE_PREFIX = "peepochat::badges::channel::"
const GLOBAL_TTL_MS = 3 * 24 * 60 * 60 * 1000
const CHANNEL_TTL_MS = 24 * 60 * 60 * 1000

export type ResolvedChatBadge = {
  id: string
  setId: string
  version: string
  title: string
  description: string
  imageUrl: string
  imageUrl2x: string
}

export type ChatBadgeCatalog = Map<string, ResolvedChatBadge>

type CachedBadgeSets = {
  cachedAt: string
  sets: TwitchChatBadgeSet[]
}

export function createEmptyBadgeCatalog(): ChatBadgeCatalog {
  return new Map()
}

export function badgeCatalogKey(setId: string, version: string) {
  return `${setId}:${version}`
}

export function buildBadgeCatalog(
  sets: TwitchChatBadgeSet[]
): ChatBadgeCatalog {
  const catalog = createEmptyBadgeCatalog()

  for (const set of sets) {
    for (const version of set.versions) {
      catalog.set(badgeCatalogKey(set.setId, version.id), {
        id: badgeCatalogKey(set.setId, version.id),
        setId: set.setId,
        version: version.id,
        title: version.title,
        description: version.description,
        imageUrl: version.imageUrl,
        imageUrl2x: version.imageUrl2x,
      })
    }
  }

  return catalog
}

export function mergeBadgeCatalogs(
  globalCatalog: ChatBadgeCatalog,
  channelCatalog: ChatBadgeCatalog
): ChatBadgeCatalog {
  return new Map([...globalCatalog, ...channelCatalog])
}

export function resolveMessageBadges(
  badges: TwitchBadge[],
  catalog: ChatBadgeCatalog
): ResolvedChatBadge[] {
  const resolved: ResolvedChatBadge[] = []

  for (const badge of badges) {
    const entry = catalog.get(badgeCatalogKey(badge.set, badge.version))
    if (entry) {
      resolved.push(entry)
    }
  }

  return resolved
}

export async function loadGlobalBadgeCatalog(
  accessToken: string,
  clientId: string,
  force = false
): Promise<ChatBadgeCatalog> {
  if (!force) {
    const cached = readCachedSets(GLOBAL_CACHE_KEY, GLOBAL_TTL_MS)
    if (cached) {
      return buildBadgeCatalog(cached)
    }
  }

  const sets = await fetchGlobalChatBadges(accessToken, clientId)
  writeCachedSets(GLOBAL_CACHE_KEY, sets)
  return buildBadgeCatalog(sets)
}

export async function loadChannelBadgeCatalog(
  broadcasterId: string,
  accessToken: string,
  clientId: string,
  force = false
): Promise<ChatBadgeCatalog> {
  const cacheKey = `${CHANNEL_CACHE_PREFIX}${broadcasterId}`

  if (!force) {
    const cached = readCachedSets(cacheKey, CHANNEL_TTL_MS)
    if (cached) {
      return buildBadgeCatalog(cached)
    }
  }

  const sets = await fetchChannelChatBadges(
    broadcasterId,
    accessToken,
    clientId
  )
  writeCachedSets(cacheKey, sets)
  return buildBadgeCatalog(sets)
}

function readCachedSets(
  key: string,
  ttlMs: number
): TwitchChatBadgeSet[] | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as CachedBadgeSets
    const cachedAt = Date.parse(parsed.cachedAt)
    if (Number.isNaN(cachedAt) || Date.now() - cachedAt > ttlMs) {
      window.localStorage.removeItem(key)
      return null
    }

    return parsed.sets
  } catch {
    return null
  }
}

function writeCachedSets(key: string, sets: TwitchChatBadgeSet[]) {
  if (typeof window === "undefined") {
    return
  }

  const payload: CachedBadgeSets = {
    cachedAt: new Date().toISOString(),
    sets,
  }

  window.localStorage.setItem(key, JSON.stringify(payload))
}
