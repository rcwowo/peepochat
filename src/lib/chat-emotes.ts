import type { TwitchChatMessage, TwitchEmote, TwitchEmoteProvider } from "@/lib/twitch-chat"

export type EmoteCatalogEntry = {
  id: string
  code: string
  provider: TwitchEmoteProvider
  imageUrl: string
}

export type ThirdPartyEmoteCatalog = Map<string, EmoteCatalogEntry>

export type ThirdPartyProviderEmotes = {
  channel: EmoteCatalogEntry[]
  global: EmoteCatalogEntry[]
}

export type ThirdPartyEmoteSets = Record<
  Exclude<TwitchEmoteProvider, "twitch">,
  ThirdPartyProviderEmotes
>

export type ThirdPartyEmoteFetchOptions = {
  bttvEnabled: boolean
  ffzEnabled: boolean
  seventvEnabled: boolean
}

const defaultThirdPartyEmoteFetchOptions: ThirdPartyEmoteFetchOptions = {
  bttvEnabled: true,
  ffzEnabled: true,
  seventvEnabled: true,
}

let thirdPartyEmoteFetchOptions: ThirdPartyEmoteFetchOptions =
  defaultThirdPartyEmoteFetchOptions

type ThirdPartyGlobalEmotes = Record<
  Exclude<TwitchEmoteProvider, "twitch">,
  EmoteCatalogEntry[]
>

type ThirdPartyRoomEmotes = Record<
  Exclude<TwitchEmoteProvider, "twitch">,
  EmoteCatalogEntry[]
>

const roomChannelCache = new Map<string, Promise<ThirdPartyRoomEmotes>>()
const roomChannelDataCache = new Map<string, ThirdPartyRoomEmotes>()
let globalEmotesCache: ThirdPartyGlobalEmotes | null = null
let globalEmotesInflight: Promise<ThirdPartyGlobalEmotes> | null = null
let globalOptionsKey: string | null = null

export function setThirdPartyEmoteFetchOptions(
  options: ThirdPartyEmoteFetchOptions
) {
  const previousKey = thirdPartyOptionsKey()
  thirdPartyEmoteFetchOptions = options
  if (thirdPartyOptionsKey() !== previousKey) {
    clearThirdPartyEmoteCache()
  }
}

/** Drop cached third-party fetches (all rooms, or one room). */
export function clearThirdPartyEmoteCache(roomId?: string) {
  if (roomId) {
    roomChannelCache.delete(roomId)
    roomChannelDataCache.delete(roomId)
    return
  }

  roomChannelCache.clear()
  roomChannelDataCache.clear()
  globalEmotesCache = null
  globalEmotesInflight = null
  globalOptionsKey = null
}

function thirdPartyOptionsKey() {
  const { bttvEnabled, ffzEnabled, seventvEnabled } = thirdPartyEmoteFetchOptions
  return `${bttvEnabled}:${ffzEnabled}:${seventvEnabled}`
}

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

function loadThirdPartyGlobalEmotes(): Promise<ThirdPartyGlobalEmotes> {
  const optionsKey = thirdPartyOptionsKey()

  if (globalEmotesCache && globalOptionsKey === optionsKey) {
    return Promise.resolve(globalEmotesCache)
  }

  if (globalEmotesInflight && globalOptionsKey === optionsKey) {
    return globalEmotesInflight
  }

  globalOptionsKey = optionsKey
  const { bttvEnabled, ffzEnabled, seventvEnabled } = thirdPartyEmoteFetchOptions

  globalEmotesInflight = Promise.allSettled([
    bttvEnabled ? fetchBetterTtvGlobalEmotes() : Promise.resolve([]),
    ffzEnabled ? fetchFrankerFaceZGlobalEmotes() : Promise.resolve([]),
    seventvEnabled ? fetchSevenTvGlobalEmotes() : Promise.resolve([]),
  ]).then(([bttv, ffz, sevenTv]) => {
    const result: ThirdPartyGlobalEmotes = {
      bttv: bttv.status === "fulfilled" ? bttv.value : [],
      ffz: ffz.status === "fulfilled" ? ffz.value : [],
      "7tv": sevenTv.status === "fulfilled" ? sevenTv.value : [],
    }
    globalEmotesCache = result
    globalEmotesInflight = null
    return result
  })

  void globalEmotesInflight.catch(() => {
    if (globalEmotesInflight) {
      globalEmotesCache = null
      globalEmotesInflight = null
      globalOptionsKey = null
    }
  })

  return globalEmotesInflight
}

async function fetchThirdPartyRoomEmotes(
  roomId: string
): Promise<ThirdPartyRoomEmotes> {
  const { bttvEnabled, ffzEnabled, seventvEnabled } = thirdPartyEmoteFetchOptions

  const [bttv, ffz, sevenTv] = await Promise.allSettled([
    bttvEnabled ? fetchBetterTtvRoomEmotes(roomId) : Promise.resolve([]),
    ffzEnabled ? fetchFrankerFaceZRoomEmotes(roomId) : Promise.resolve([]),
    seventvEnabled ? fetchSevenTvRoomEmotes(roomId) : Promise.resolve([]),
  ])

  return {
    bttv: bttv.status === "fulfilled" ? bttv.value : [],
    ffz: ffz.status === "fulfilled" ? ffz.value : [],
    "7tv": sevenTv.status === "fulfilled" ? sevenTv.value : [],
  }
}

function loadThirdPartyRoomEmotes(roomId: string): Promise<ThirdPartyRoomEmotes> {
  const cached = roomChannelDataCache.get(roomId)
  if (cached) {
    return Promise.resolve(cached)
  }

  let pending = roomChannelCache.get(roomId)
  if (!pending) {
    pending = fetchThirdPartyRoomEmotes(roomId)
      .then((room) => {
        roomChannelDataCache.set(roomId, room)
        return room
      })
      .finally(() => {
        if (roomChannelCache.get(roomId) === pending) {
          roomChannelCache.delete(roomId)
        }
      })
    roomChannelCache.set(roomId, pending)
  }
  return pending
}

function mergeThirdPartySets(
  global: ThirdPartyGlobalEmotes,
  room: ThirdPartyRoomEmotes
): ThirdPartyEmoteSets {
  return {
    bttv: { channel: room.bttv, global: global.bttv },
    ffz: { channel: room.ffz, global: global.ffz },
    "7tv": { channel: room["7tv"], global: global["7tv"] },
  }
}

/** Global emotes fetched once per session; room emotes once per broadcaster. */
export function getThirdPartyEmoteSets(
  roomId: string
): Promise<ThirdPartyEmoteSets> {
  return Promise.all([
    loadThirdPartyGlobalEmotes(),
    loadThirdPartyRoomEmotes(roomId),
  ]).then(([global, room]) => mergeThirdPartySets(global, room))
}

export function buildThirdPartyEmoteCatalog(
  sets: ThirdPartyEmoteSets
): ThirdPartyEmoteCatalog {
  const catalog = createEmptyEmoteCatalog()

  for (const provider of PROVIDER_PRIORITY) {
    for (const entry of [...sets[provider].channel, ...sets[provider].global]) {
      if (!catalog.has(entry.code)) {
        catalog.set(entry.code, entry)
      }
    }
  }

  return catalog
}

export async function fetchThirdPartyEmoteCatalog(
  roomId: string
): Promise<ThirdPartyEmoteCatalog> {
  const sets = await getThirdPartyEmoteSets(roomId)
  return buildThirdPartyEmoteCatalog(sets)
}

export type TwitchEmoteHydration = {
  byCode: Map<string, EmoteCatalogEntry>
  byId: Map<string, EmoteCatalogEntry>
}

export function hydrateMessageEmotes(
  message: TwitchChatMessage,
  catalog: ThirdPartyEmoteCatalog | null,
  twitchCatalog?: TwitchEmoteHydration | null
): TwitchChatMessage {
  const nativeEmotes = upgradeTwitchEmoteImages(
    message.emotes.filter((emote) => emote.provider === "twitch"),
    twitchCatalog
  )

  let emotes = nativeEmotes

  if (catalog) {
    emotes = mergeEmotesFromCodeCatalog(message.text, emotes, catalog)
  }

  if (twitchCatalog) {
    emotes = mergeEmotesFromCodeCatalog(
      message.text,
      emotes,
      twitchCatalog.byCode,
      (entry) => entry.provider === "twitch"
    )
  }

  return { ...message, emotes }
}

function upgradeTwitchEmoteImages(
  emotes: TwitchEmote[],
  twitchCatalog?: TwitchEmoteHydration | null
): TwitchEmote[] {
  if (!twitchCatalog) {
    return emotes
  }

  return emotes.map((emote) => {
    const fromCatalog =
      twitchCatalog.byId.get(emote.id) ?? twitchCatalog.byCode.get(emote.code)

    if (!fromCatalog || fromCatalog.provider !== "twitch") {
      return emote
    }

    return { ...emote, imageUrl: fromCatalog.imageUrl }
  })
}

function mergeEmotesFromCodeCatalog(
  text: string,
  existing: TwitchEmote[],
  catalog: Map<string, EmoteCatalogEntry>,
  accept?: (entry: EmoteCatalogEntry) => boolean
): TwitchEmote[] {
  if (catalog.size === 0) {
    return existing
  }

  const merged = [...existing]
  const occupied = normalizeRanges(
    existing.map((emote) => ({ start: emote.start, end: emote.end }))
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
    if (!entry || (accept && !accept(entry))) {
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

function mapBetterTtvEmote(emote: BetterTtvEmote): EmoteCatalogEntry {
  return {
    id: emote.id,
    code: emote.code,
    provider: "bttv",
    imageUrl: `https://cdn.betterttv.net/emote/${encodeURIComponent(emote.id)}/1x.${emote.imageType ?? "webp"}`,
  }
}

async function fetchBetterTtvGlobalEmotes(): Promise<EmoteCatalogEntry[]> {
  const response = await fetchJson<BetterTtvEmote[]>(
    "https://api.betterttv.net/3/cached/emotes/global"
  )
  return response.map(mapBetterTtvEmote)
}

async function fetchBetterTtvRoomEmotes(roomId: string): Promise<EmoteCatalogEntry[]> {
  const response = await fetchJson<BetterTtvUserResponse>(
    `https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(roomId)}`
  )

  return [
    ...(response.channelEmotes ?? []),
    ...(response.sharedEmotes ?? []),
  ].map(mapBetterTtvEmote)
}

function mapFrankerFaceZEmote(emote: FrankerFaceZEmote): EmoteCatalogEntry | null {
  const imageUrl = emote.animated?.["1"] ?? emote.urls?.["1"] ?? ""
  if (!imageUrl) return null

  return {
    id: String(emote.id),
    code: emote.name,
    provider: "ffz",
    imageUrl,
  }
}

function compactFrankerFaceZEmotes(
  entries: Array<EmoteCatalogEntry | null>
): EmoteCatalogEntry[] {
  return entries.filter((emote): emote is EmoteCatalogEntry => emote !== null)
}

async function fetchFrankerFaceZGlobalEmotes(): Promise<EmoteCatalogEntry[]> {
  const response = await fetchJson<FrankerFaceZGlobalResponse>(
    "https://api.frankerfacez.com/v1/set/global"
  )
  return compactFrankerFaceZEmotes(
    extractFrankerFaceZGlobalEmotes(response).map(mapFrankerFaceZEmote)
  )
}

async function fetchFrankerFaceZRoomEmotes(roomId: string): Promise<EmoteCatalogEntry[]> {
  const response = await fetchJson<FrankerFaceZRoomResponse>(
    `https://api.frankerfacez.com/v1/room/id/${encodeURIComponent(roomId)}`
  )
  return compactFrankerFaceZEmotes(
    extractFrankerFaceZEmotes(response.sets).map(mapFrankerFaceZEmote)
  )
}

function mapSevenTvEmote(emote: SevenTvEmote): EmoteCatalogEntry | null {
  const imageUrl = buildSevenTvImageUrl(emote.data?.host)
  if (!imageUrl) return null

  return {
    id: emote.id,
    code: emote.name,
    provider: "7tv",
    imageUrl,
  }
}

function compactSevenTvEmotes(
  entries: Array<EmoteCatalogEntry | null>
): EmoteCatalogEntry[] {
  return entries.filter((emote): emote is EmoteCatalogEntry => emote !== null)
}

async function fetchSevenTvGlobalEmotes(): Promise<EmoteCatalogEntry[]> {
  const response = await fetchJson<SevenTvEmoteSet>("https://7tv.io/v3/emote-sets/global")
  return compactSevenTvEmotes((response.emotes ?? []).map(mapSevenTvEmote))
}

async function fetchSevenTvRoomEmotes(roomId: string): Promise<EmoteCatalogEntry[]> {
  const response = await fetchJson<SevenTvUserResponse>(
    `https://7tv.io/v3/users/twitch/${encodeURIComponent(roomId)}`
  )
  return compactSevenTvEmotes(
    (response.emote_set?.emotes ?? []).map(mapSevenTvEmote)
  )
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