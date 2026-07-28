import { devLoggedFetch } from "@/lib/dev-logger"
import { TwitchApiError } from "@/lib/twitch/twitch-api"
import type { TwitchEmote, TwitchCheermoteMeta } from "@/lib/twitch/twitch-chat"

export type CheermoteTier = {
  minBits: number
  id: string
  color: string
  animatedUrl: string
  staticUrl: string
}

export type CheermoteSet = {
  prefix: string
  tiers: CheermoteTier[]
}

export type CheermoteMatch = {
  prefix: string
  amount: number
  tier: CheermoteTier
  animatedUrl: string
  staticUrl: string
  color: string
}

export type CheermoteCatalog = {
  sets: CheermoteSet[]
  match: (code: string) => CheermoteMatch | null
}

export type { TwitchCheermoteMeta }

type HelixCheermoteTier = {
  min_bits: number
  id: string
  color: string
  images: {
    dark?: {
      animated?: Record<string, string>
      static?: Record<string, string>
    }
  }
}

type HelixCheermote = {
  prefix: string
  tiers: HelixCheermoteTier[]
}

const CHEERMOTE_THEME = "dark"
const CHEERMOTE_SCALE = "1"

const cheermoteCache = new Map<string, Promise<CheermoteCatalog>>()
const cheermoteDataCache = new Map<string, CheermoteCatalog>()

function cheermoteCacheKey(roomId: string | null | undefined) {
  return roomId?.trim() || "global"
}

function pickCheermoteImageUrl(
  images: HelixCheermoteTier["images"] | undefined,
  state: "animated" | "static"
): string {
  const themed = images?.[CHEERMOTE_THEME]?.[state]
  if (!themed) {
    return ""
  }

  return (
    themed[CHEERMOTE_SCALE] ?? themed["1"] ?? Object.values(themed)[0] ?? ""
  )
}

function buildTier(tier: HelixCheermoteTier): CheermoteTier | null {
  const animatedUrl = pickCheermoteImageUrl(tier.images, "animated")
  const staticUrl = pickCheermoteImageUrl(tier.images, "static")

  if (!animatedUrl && !staticUrl) {
    return null
  }

  return {
    minBits: tier.min_bits,
    id: tier.id,
    color: tier.color,
    animatedUrl,
    staticUrl: staticUrl || animatedUrl,
  }
}

function buildCheermoteCatalogFromHelix(
  data: HelixCheermote[]
): CheermoteCatalog {
  const sets: CheermoteSet[] = []

  for (const entry of data) {
    const prefix = entry.prefix?.trim()
    if (!prefix) {
      continue
    }

    const tiers = entry.tiers
      .map(buildTier)
      .filter((tier): tier is CheermoteTier => tier !== null)
      .sort((left, right) => right.minBits - left.minBits)

    if (tiers.length === 0) {
      continue
    }

    sets.push({ prefix, tiers })
  }

  sets.sort((left, right) => right.prefix.length - left.prefix.length)

  return {
    sets,
    match: (code: string) => matchCheermoteCode(sets, code),
  }
}

function matchCheermoteCode(
  sets: CheermoteSet[],
  code: string
): CheermoteMatch | null {
  for (const set of sets) {
    const pattern = new RegExp(
      `^${escapeRegExp(set.prefix)}([1-9][0-9]*)$`,
      "i"
    )
    const match = code.match(pattern)
    if (!match) {
      continue
    }

    const amount = Number(match[1])
    if (!Number.isFinite(amount) || amount <= 0) {
      continue
    }

    const tier = resolveCheermoteTier(set.tiers, amount)
    if (!tier) {
      continue
    }

    return {
      prefix: set.prefix,
      amount,
      tier,
      animatedUrl: tier.animatedUrl,
      staticUrl: tier.staticUrl,
      color: tier.color,
    }
  }

  return null
}

function resolveCheermoteTier(
  tiers: CheermoteTier[],
  amount: number
): CheermoteTier | null {
  for (const tier of tiers) {
    if (amount >= tier.minBits) {
      return tier
    }
  }

  return tiers.at(-1) ?? null
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildFallbackCheerCatalog(): CheermoteCatalog {
  const tiers: CheermoteTier[] = [
    {
      minBits: 100000,
      id: "100000",
      color: "#f43021",
      animatedUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/100000/1.gif",
      staticUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/static/100000/1.png",
    },
    {
      minBits: 10000,
      id: "10000",
      color: "#f43021",
      animatedUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/10000/1.gif",
      staticUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/static/10000/1.png",
    },
    {
      minBits: 5000,
      id: "5000",
      color: "#2ecc71",
      animatedUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/5000/1.gif",
      staticUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/static/5000/1.png",
    },
    {
      minBits: 1000,
      id: "1000",
      color: "#0099fe",
      animatedUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/1000/1.gif",
      staticUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/static/1000/1.png",
    },
    {
      minBits: 500,
      id: "500",
      color: "#1db2a5",
      animatedUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/500/1.gif",
      staticUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/static/500/1.png",
    },
    {
      minBits: 100,
      id: "100",
      color: "#9c3ee8",
      animatedUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/100/1.gif",
      staticUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/static/100/1.png",
    },
    {
      minBits: 1,
      id: "1",
      color: "#979797",
      animatedUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/1/1.gif",
      staticUrl:
        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/static/1/1.png",
    },
  ]

  const sets: CheermoteSet[] = [{ prefix: "Cheer", tiers }]
  return {
    sets,
    match: (code: string) => matchCheermoteCode(sets, code),
  }
}

export const DEFAULT_CHEERMOTE_CATALOG = buildFallbackCheerCatalog()

export function clearCheermoteCache(roomId?: string) {
  if (roomId) {
    const key = cheermoteCacheKey(roomId)
    cheermoteCache.delete(key)
    cheermoteDataCache.delete(key)
    return
  }

  cheermoteCache.clear()
  cheermoteDataCache.clear()
}

export function getCachedCheermoteCatalog(
  roomId: string | null | undefined
): CheermoteCatalog {
  return (
    cheermoteDataCache.get(cheermoteCacheKey(roomId)) ??
    DEFAULT_CHEERMOTE_CATALOG
  )
}

export async function fetchCheermotes(
  accessToken: string,
  clientId: string,
  broadcasterId?: string | null
): Promise<CheermoteCatalog> {
  const key = cheermoteCacheKey(broadcasterId ?? null)
  const cached = cheermoteDataCache.get(key)
  if (cached) {
    return cached
  }

  const pending = cheermoteCache.get(key)
  if (pending) {
    return pending
  }

  const promise = loadCheermotes(accessToken, clientId, broadcasterId).then(
    (catalog) => {
      cheermoteDataCache.set(key, catalog)
      return catalog
    }
  )

  cheermoteCache.set(key, promise)
  return promise
}

async function loadCheermotes(
  accessToken: string,
  clientId: string,
  broadcasterId?: string | null
): Promise<CheermoteCatalog> {
  const params = new URLSearchParams()
  if (broadcasterId?.trim()) {
    params.set("broadcaster_id", broadcasterId.trim())
  }

  const query = params.toString()
  const url = query
    ? `https://api.twitch.tv/helix/bits/cheermotes?${query}`
    : "https://api.twitch.tv/helix/bits/cheermotes"

  const response = await devLoggedFetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
  })

  if (!response.ok) {
    throw new TwitchApiError(
      "Could not load Twitch cheermotes.",
      response.status
    )
  }

  const payload = (await response.json()) as { data?: HelixCheermote[] }
  const catalog = buildCheermoteCatalogFromHelix(payload.data ?? [])

  if (catalog.sets.length === 0) {
    return DEFAULT_CHEERMOTE_CATALOG
  }

  return catalog
}

function cheermoteToEmote(
  emote: TwitchEmote,
  match: CheermoteMatch
): TwitchEmote {
  return {
    ...emote,
    id: match.tier.id,
    provider: "twitch",
    imageUrl: match.animatedUrl,
    cheermote: {
      prefix: match.prefix,
      amount: match.amount,
      color: match.color,
    },
  }
}

function createCheermoteEmote(
  match: CheermoteMatch,
  start: number,
  end: number
): TwitchEmote {
  return {
    id: match.tier.id,
    code: match.prefix + match.amount,
    provider: "twitch",
    imageUrl: match.animatedUrl,
    start,
    end,
    cheermote: {
      prefix: match.prefix,
      amount: match.amount,
      color: match.color,
    },
  }
}

function hasRangeOverlap(
  occupied: { start: number; end: number }[],
  start: number,
  end: number
) {
  return occupied.some((range) => start <= range.end && end >= range.start)
}

export function hydrateCheermotes<
  T extends { text: string; emotes: TwitchEmote[]; bits?: number | null },
>(message: T, catalog: CheermoteCatalog): T {
  const activeCatalog =
    catalog.sets.length > 0 ? catalog : DEFAULT_CHEERMOTE_CATALOG

  let changed = false
  const result = message.emotes.map((emote) => ({ ...emote }))

  for (let index = 0; index < result.length; index += 1) {
    const emote = result[index]!
    const code = message.text.slice(emote.start, emote.end + 1)
    const match = activeCatalog.match(code)

    if (!match && !(message.bits && message.bits > 0)) {
      continue
    }

    const resolved =
      match ??
      activeCatalog.match(`${emote.code}${message.bits}`) ??
      activeCatalog.match(`Cheer${message.bits}`)

    if (!resolved) {
      continue
    }

    result[index] = cheermoteToEmote(emote, resolved)
    changed = true
  }

  const occupied = result.map((emote) => ({
    start: emote.start,
    end: emote.end,
  }))

  const tokenPattern = /\S+/g
  for (const tokenMatch of message.text.matchAll(tokenPattern)) {
    const code = tokenMatch[0]
    const start = tokenMatch.index ?? -1
    if (start < 0) {
      continue
    }

    const end = start + code.length - 1
    if (hasRangeOverlap(occupied, start, end)) {
      continue
    }

    const cheerMatch = activeCatalog.match(code)
    if (!cheerMatch) {
      continue
    }

    result.push(createCheermoteEmote(cheerMatch, start, end))
    occupied.push({ start, end })
    changed = true
  }

  if (!changed) {
    return message
  }

  result.sort((left, right) => left.start - right.start)

  return {
    ...message,
    emotes: result,
  }
}
