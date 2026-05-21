import type { TwitchChatMessage, TwitchEmote, TwitchEmoteProvider } from "@/lib/twitch-chat"

type EmoteCatalogEntry = {
  id: string
  code: string
  provider: Exclude<TwitchEmoteProvider, "twitch">
  imageUrl: string
}

export type ThirdPartyEmoteCatalog = Map<string, EmoteCatalogEntry>

type BetterTtvEmote = {
  id: string
  code: string
  imageType?: string
}

type BetterTtvUserResponse = {
  channelEmotes?: BetterTtvEmote[]
  sharedEmotes?: BetterTtvEmote[]
}

type FrankerFaceZEmote = {
  id: number
  name: string
  urls?: Record<string, string>
  animated?: Record<string, string>
}

type FrankerFaceZSet = {
  emoticons?: FrankerFaceZEmote[]
}

type FrankerFaceZGlobalResponse = {
  default_sets?: number[]
  sets?: Record<string, FrankerFaceZSet>
}

type FrankerFaceZRoomResponse = {
  sets?: Record<string, FrankerFaceZSet>
}

type SevenTvFile = {
  name: string
}

type SevenTvHost = {
  url: string
  files?: SevenTvFile[]
}

type SevenTvEmoteData = {
  host?: SevenTvHost
}

type SevenTvEmote = {
  id: string
  name: string
  data?: SevenTvEmoteData
}

type SevenTvEmoteSet = {
  emotes?: SevenTvEmote[]
}

type SevenTvUserResponse = {
  emote_set?: SevenTvEmoteSet
}

type TextRange = {
  start: number
  end: number
}

const PROVIDER_PRIORITY: Array<Exclude<TwitchEmoteProvider, "twitch">> = [
  "7tv",
  "bttv",
  "ffz",
]

export function createEmptyEmoteCatalog(): ThirdPartyEmoteCatalog {
  return new Map()
}

export async function fetchThirdPartyEmoteCatalog(
  roomId: string
): Promise<ThirdPartyEmoteCatalog> {
  const results = await Promise.allSettled([
    fetchBetterTtvEmotes(roomId),
    fetchFrankerFaceZEmotes(roomId),
    fetchSevenTvEmotes(roomId),
  ])

  const catalog = createEmptyEmoteCatalog()

  for (const provider of PROVIDER_PRIORITY) {
    const result =
      provider === "bttv"
        ? results[0]
        : provider === "ffz"
          ? results[1]
          : results[2]

    if (result.status !== "fulfilled") {
      continue
    }

    for (const entry of result.value) {
      if (!catalog.has(entry.code)) {
        catalog.set(entry.code, entry)
      }
    }
  }

  return catalog
}

export function hydrateMessageEmotes(
  message: TwitchChatMessage,
  catalog: ThirdPartyEmoteCatalog | null
): TwitchChatMessage {
  const nativeEmotes = message.emotes.filter(
    (emote) => emote.provider === "twitch"
  )

  return {
    ...message,
    emotes: catalog
      ? mergeThirdPartyEmotes(message.text, nativeEmotes, catalog)
      : nativeEmotes,
  }
}

function mergeThirdPartyEmotes(
  text: string,
  nativeEmotes: TwitchEmote[],
  catalog: ThirdPartyEmoteCatalog
): TwitchEmote[] {
  if (catalog.size === 0) {
    return nativeEmotes
  }

  const merged = [...nativeEmotes]
  const occupied = normalizeRanges(
    nativeEmotes.map((emote) => ({ start: emote.start, end: emote.end }))
  )

  const tokenPattern = /\S+/g
  for (const match of text.matchAll(tokenPattern)) {
    const code = match[0]
    const start = match.index ?? -1
    if (start < 0) {
      continue
    }

    const end = start + code.length - 1
    if (hasOverlap(occupied, start, end)) {
      continue
    }

    const entry = catalog.get(code)
    if (!entry) {
      continue
    }

    merged.push({
      id: entry.id,
      code: entry.code,
      provider: entry.provider,
      imageUrl: entry.imageUrl,
      start,
      end,
    })
  }

  return merged.sort((left, right) => left.start - right.start)
}

function hasOverlap(ranges: TextRange[], start: number, end: number) {
  return ranges.some((range) => start <= range.end && end >= range.start)
}

function normalizeRanges(ranges: TextRange[]): TextRange[] {
  const sorted = ranges
    .filter((range) => range.start >= 0 && range.end >= range.start)
    .sort((left, right) => left.start - right.start)

  if (sorted.length === 0) {
    return []
  }

  const merged = [sorted[0]!]

  for (const range of sorted.slice(1)) {
    const current = merged[merged.length - 1]!
    if (range.start <= current.end + 1) {
      current.end = Math.max(current.end, range.end)
      continue
    }

    merged.push({ ...range })
  }

  return merged
}

async function fetchBetterTtvEmotes(roomId: string): Promise<EmoteCatalogEntry[]> {
  const [globalResponse, roomResponse] = await Promise.allSettled([
    fetchJson<BetterTtvEmote[]>("https://api.betterttv.net/3/cached/emotes/global"),
    fetchJson<BetterTtvUserResponse>(
      `https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(roomId)}`
    ),
  ])

  const source: BetterTtvEmote[] = []

  if (roomResponse.status === "fulfilled") {
    source.push(
      ...(roomResponse.value.channelEmotes ?? []),
      ...(roomResponse.value.sharedEmotes ?? [])
    )
  }

  if (globalResponse.status === "fulfilled") {
    source.push(...globalResponse.value)
  }

  return source.map((emote) => ({
    id: emote.id,
    code: emote.code,
    provider: "bttv",
    imageUrl: `https://cdn.betterttv.net/emote/${encodeURIComponent(emote.id)}/1x.${emote.imageType ?? "webp"}`,
  }))
}

async function fetchFrankerFaceZEmotes(
  roomId: string
): Promise<EmoteCatalogEntry[]> {
  const [globalResponse, roomResponse] = await Promise.allSettled([
    fetchJson<FrankerFaceZGlobalResponse>("https://api.frankerfacez.com/v1/set/global"),
    fetchJson<FrankerFaceZRoomResponse>(
      `https://api.frankerfacez.com/v1/room/id/${encodeURIComponent(roomId)}`
    ),
  ])

  const source: FrankerFaceZEmote[] = []

  if (roomResponse.status === "fulfilled") {
    source.push(...extractFrankerFaceZEmotes(roomResponse.value.sets))
  }

  if (globalResponse.status === "fulfilled") {
    source.push(...extractFrankerFaceZGlobalEmotes(globalResponse.value))
  }

  return source
    .map((emote) => ({
      id: String(emote.id),
      code: emote.name,
      provider: "ffz" as const,
      imageUrl: emote.animated?.["1"] ?? emote.urls?.["1"] ?? "",
    }))
    .filter((emote) => emote.imageUrl)
}

async function fetchSevenTvEmotes(roomId: string): Promise<EmoteCatalogEntry[]> {
  const [globalResponse, roomResponse] = await Promise.allSettled([
    fetchJson<SevenTvEmoteSet>("https://7tv.io/v3/emote-sets/global"),
    fetchJson<SevenTvUserResponse>(
      `https://7tv.io/v3/users/twitch/${encodeURIComponent(roomId)}`
    ),
  ])

  const source: SevenTvEmote[] = []

  if (roomResponse.status === "fulfilled") {
    source.push(...(roomResponse.value.emote_set?.emotes ?? []))
  }

  if (globalResponse.status === "fulfilled") {
    source.push(...(globalResponse.value.emotes ?? []))
  }

  return source
    .map((emote) => ({
      id: emote.id,
      code: emote.name,
      provider: "7tv" as const,
      imageUrl: buildSevenTvImageUrl(emote.data?.host),
    }))
    .filter((emote) => emote.imageUrl)
}

function extractFrankerFaceZGlobalEmotes(
  response: FrankerFaceZGlobalResponse
): FrankerFaceZEmote[] {
  const defaultSets = new Set((response.default_sets ?? []).map(String))

  return Object.entries(response.sets ?? {}).flatMap(([setId, set]) =>
    defaultSets.size === 0 || defaultSets.has(setId) ? set.emoticons ?? [] : []
  )
}

function extractFrankerFaceZEmotes(
  sets: Record<string, FrankerFaceZSet> | undefined
): FrankerFaceZEmote[] {
  return Object.values(sets ?? {}).flatMap((set) => set.emoticons ?? [])
}

function buildSevenTvImageUrl(host: SevenTvHost | undefined): string {
  if (!host?.url) {
    return ""
  }

  const file = host.files?.find((candidate) => candidate.name.startsWith("1x."))
    ?? host.files?.[0]

  if (!file?.name) {
    return ""
  }

  return `https:${host.url}/${file.name}`
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  return (await response.json()) as T
}