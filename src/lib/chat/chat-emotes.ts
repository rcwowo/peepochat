import { devLoggedFetch } from "@/lib/dev-logger"
import { isSevenTvZeroWidthEmote } from "@/lib/chat/seventv-emotes"
import type { SevenTvActiveEmote } from "@/lib/chat/seventv-event-api"
import type {
  TwitchChatMessage,
  TwitchEmote,
  TwitchEmoteProvider,
} from "@/lib/twitch/twitch-chat"

export type EmoteCatalogEntry = {
  id: string
  code: string
  provider: TwitchEmoteProvider
  imageUrl: string
  aliases?: string[]
  ownerId?: string
  ownerName?: string
  ownerLogin?: string
  /** 7TV emote flags bitmask (e.g. zero-width). */
  seventvFlags?: number
  /** 7TV listed status; omitted or true when listed. */
  listed?: boolean
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
  showUnlistedEmotes: boolean
}

export type SeventvEmoteRenderOptions = {
  zeroWidthEnabled: boolean
}

const defaultThirdPartyEmoteFetchOptions: ThirdPartyEmoteFetchOptions = {
  bttvEnabled: true,
  ffzEnabled: true,
  seventvEnabled: true,
  showUnlistedEmotes: true,
}

const defaultSeventvEmoteRenderOptions: SeventvEmoteRenderOptions = {
  zeroWidthEnabled: true,
}

let thirdPartyEmoteFetchOptions: ThirdPartyEmoteFetchOptions =
  defaultThirdPartyEmoteFetchOptions

let seventvEmoteRenderOptions: SeventvEmoteRenderOptions =
  defaultSeventvEmoteRenderOptions

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
const roomSevenTvBindings = new Map<string, SevenTvRoomBinding>()
const sevenTvEmoteSetRooms = new Map<string, Set<string>>()
const sevenTvUserRooms = new Map<string, Set<string>>()
let globalEmotesCache: ThirdPartyGlobalEmotes | null = null
let globalEmotesInflight: Promise<ThirdPartyGlobalEmotes> | null = null
let globalOptionsKey: string | null = null

export type SevenTvRoomBinding = {
  emoteSetId: string
  seventvUserId: string
  twitchConnectionIndex: number
}

export function setThirdPartyEmoteFetchOptions(
  options: ThirdPartyEmoteFetchOptions
) {
  const previousKey = thirdPartyOptionsKey()
  thirdPartyEmoteFetchOptions = options
  if (thirdPartyOptionsKey() !== previousKey) {
    clearThirdPartyEmoteCache()
  }
}

export function setSeventvEmoteRenderOptions(
  options: SeventvEmoteRenderOptions
) {
  seventvEmoteRenderOptions = options
}

/** Drop cached third-party fetches (all rooms, or one room). */
export function clearThirdPartyEmoteCache(roomId?: string) {
  if (roomId) {
    roomChannelCache.delete(roomId)
    roomChannelDataCache.delete(roomId)
    clearSevenTvRoomBinding(roomId)
    return
  }

  roomChannelCache.clear()
  roomChannelDataCache.clear()
  clearAllSevenTvRoomBindings()
  globalEmotesCache = null
  globalEmotesInflight = null
  globalOptionsKey = null
}

export function getSevenTvRoomBinding(
  roomId: string
): SevenTvRoomBinding | null {
  return roomSevenTvBindings.get(roomId) ?? null
}

export function getRoomIdsForSevenTvEmoteSet(emoteSetId: string): string[] {
  return [...(sevenTvEmoteSetRooms.get(emoteSetId) ?? [])]
}

export function getRoomIdsForSevenTvUser(userId: string): string[] {
  return [...(sevenTvUserRooms.get(userId) ?? [])]
}

export function applySevenTvChannelEmoteAdd(
  roomId: string,
  raw: SevenTvActiveEmote
): EmoteCatalogEntry | null {
  const room = roomChannelDataCache.get(roomId)
  if (!room) return null

  const entry = mapSevenTvEmote(raw)
  if (!entry) return null
  if (
    !thirdPartyEmoteFetchOptions.showUnlistedEmotes &&
    entry.listed === false
  ) {
    return null
  }

  const nextChannel = [
    ...room["7tv"].filter((emote) => emote.id !== entry.id),
    entry,
  ]
  roomChannelDataCache.set(roomId, { ...room, "7tv": nextChannel })
  return entry
}

export function applySevenTvChannelEmoteRemove(
  roomId: string,
  emoteId: string
): EmoteCatalogEntry | null {
  const room = roomChannelDataCache.get(roomId)
  if (!room) return null

  const existing = room["7tv"].find((emote) => emote.id === emoteId) ?? null
  if (!existing) return null

  roomChannelDataCache.set(roomId, {
    ...room,
    "7tv": room["7tv"].filter((emote) => emote.id !== emoteId),
  })
  return existing
}

export function applySevenTvChannelEmoteRename(
  roomId: string,
  emoteId: string,
  newName: string
): { previous: EmoteCatalogEntry; next: EmoteCatalogEntry } | null {
  const room = roomChannelDataCache.get(roomId)
  if (!room) return null

  const index = room["7tv"].findIndex((emote) => emote.id === emoteId)
  if (index < 0) return null

  const previous = room["7tv"][index]!
  if (previous.code === newName) {
    return null
  }

  const next: EmoteCatalogEntry = { ...previous, code: newName }
  const nextChannel = [...room["7tv"]]
  nextChannel[index] = next
  roomChannelDataCache.set(roomId, { ...room, "7tv": nextChannel })
  return { previous, next }
}

export async function replaceSevenTvChannelEmotesFromSet(
  roomId: string,
  emoteSetId: string
): Promise<{ emotes: EmoteCatalogEntry[]; setName: string } | null> {
  const room = roomChannelDataCache.get(roomId)
  if (!room) return null

  const response = await fetchJson<SevenTvEmoteSet>(
    `https://7tv.io/v3/emote-sets/${encodeURIComponent(emoteSetId)}`
  )
  const emotes = compactSevenTvEmotes(
    (response.emotes ?? []).map((emote) => mapSevenTvEmote(emote))
  )
  roomChannelDataCache.set(roomId, { ...room, "7tv": emotes })

  const binding = roomSevenTvBindings.get(roomId)
  if (binding) {
    setSevenTvRoomBinding(roomId, {
      ...binding,
      emoteSetId,
    })
  }

  return {
    emotes,
    setName: response.name?.trim() || "emote set",
  }
}

function thirdPartyOptionsKey() {
  const { bttvEnabled, ffzEnabled, seventvEnabled, showUnlistedEmotes } =
    thirdPartyEmoteFetchOptions
  return `${bttvEnabled}:${ffzEnabled}:${seventvEnabled}:${showUnlistedEmotes}`
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
  owner?: {
    name?: string
    display_name?: string
  }
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
  alias?: string[]
  flags?: number
  listed?: boolean
  owner?: {
    display_name?: string
    username?: string
    connections?: Array<{
      platform?: string
      username?: string
      display_name?: string
    }>
  }
}

type SevenTvEmote = {
  id: string
  name: string
  data?: SevenTvEmoteData
}

type SevenTvEmoteSet = {
  id?: string
  name?: string
  emotes?: SevenTvEmote[]
}

type SevenTvUserResponse = {
  emote_set?: SevenTvEmoteSet
  user?: {
    id?: string
    connections?: Array<{
      platform?: string
      id?: string
    }>
  }
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
  const { bttvEnabled, ffzEnabled, seventvEnabled } =
    thirdPartyEmoteFetchOptions

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
  const { bttvEnabled, ffzEnabled, seventvEnabled } =
    thirdPartyEmoteFetchOptions

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

function loadThirdPartyRoomEmotes(
  roomId: string
): Promise<ThirdPartyRoomEmotes> {
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

function emotesEqual(left: TwitchEmote[], right: TwitchEmote[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!
    const b = right[index]!
    if (
      a.id !== b.id ||
      a.code !== b.code ||
      a.provider !== b.provider ||
      a.imageUrl !== b.imageUrl ||
      a.start !== b.start ||
      a.end !== b.end ||
      !overlaysEqual(a.overlays, b.overlays)
    ) {
      return false
    }
  }

  return true
}

function overlaysEqual(
  left: TwitchEmote[] | undefined,
  right: TwitchEmote[] | undefined
): boolean {
  const leftOverlays = left ?? []
  const rightOverlays = right ?? []

  if (leftOverlays.length !== rightOverlays.length) {
    return false
  }

  for (let index = 0; index < leftOverlays.length; index += 1) {
    const a = leftOverlays[index]!
    const b = rightOverlays[index]!
    if (
      a.id !== b.id ||
      a.code !== b.code ||
      a.provider !== b.provider ||
      a.imageUrl !== b.imageUrl ||
      a.start !== b.start ||
      a.end !== b.end
    ) {
      return false
    }
  }

  return true
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

  if (emotesEqual(emotes, message.emotes)) {
    return message
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

    return {
      ...emote,
      imageUrl: fromCatalog.imageUrl,
    }
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

  const result: TwitchEmote[] = existing.map((emote) => ({
    ...emote,
    overlays: emote.overlays ? [...emote.overlays] : undefined,
  }))
  let occupied = normalizeRanges(
    existing.map((emote) => ({ start: emote.start, end: emote.end }))
  )
  let lastEmoteIndex: number | null = null

  const tokenPattern = /\S+/g
  for (const match of text.matchAll(tokenPattern)) {
    const code = match[0]
    const start = match.index ?? -1
    if (start < 0) {
      continue
    }

    const end = start + code.length - 1
    const existingEmoteIndex = result.findIndex(
      (emote) => emote.start === start && emote.end === end
    )

    if (existingEmoteIndex >= 0) {
      lastEmoteIndex = existingEmoteIndex
      continue
    }

    if (hasOverlap(occupied, start, end)) {
      lastEmoteIndex = null
      continue
    }

    const entry = catalog.get(code)
    if (!entry || (accept && !accept(entry))) {
      lastEmoteIndex = null
      continue
    }

    const isZeroWidth = isSevenTvZeroWidthEmote(entry)

    if (
      isZeroWidth &&
      seventvEmoteRenderOptions.zeroWidthEnabled &&
      lastEmoteIndex !== null
    ) {
      const target = result[lastEmoteIndex]!
      target.overlays = [
        ...(target.overlays ?? []),
        catalogEntryToEmote(entry, start, end),
      ]
      occupied = normalizeRanges([...occupied, { start, end }])
      continue
    }

    result.push(catalogEntryToEmote(entry, start, end))
    occupied = normalizeRanges([...occupied, { start, end }])
    lastEmoteIndex = result.length - 1
  }

  return result.sort((left, right) => left.start - right.start)
}

function catalogEntryToEmote(
  entry: EmoteCatalogEntry,
  start: number,
  end: number
): TwitchEmote {
  return {
    id: entry.id,
    code: entry.code,
    provider: entry.provider,
    imageUrl: entry.imageUrl,
    start,
    end,
  }
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
  return response.map((emote) => mapBetterTtvEmote(emote))
}

async function fetchBetterTtvRoomEmotes(
  roomId: string
): Promise<EmoteCatalogEntry[]> {
  const response = await fetchJson<BetterTtvUserResponse>(
    `https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(roomId)}`
  )

  return [
    ...(response.channelEmotes ?? []),
    ...(response.sharedEmotes ?? []),
  ].map((emote) => mapBetterTtvEmote(emote))
}

function mapFrankerFaceZEmote(
  emote: FrankerFaceZEmote
): EmoteCatalogEntry | null {
  const imageUrl = emote.animated?.["1"] ?? emote.urls?.["1"] ?? ""
  if (!imageUrl) return null

  return {
    id: String(emote.id),
    code: emote.name,
    provider: "ffz",
    imageUrl,
    ownerName: emote.owner?.display_name ?? emote.owner?.name,
    ownerLogin: emote.owner?.name,
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
    extractFrankerFaceZGlobalEmotes(response).map((emote) =>
      mapFrankerFaceZEmote(emote)
    )
  )
}

async function fetchFrankerFaceZRoomEmotes(
  roomId: string
): Promise<EmoteCatalogEntry[]> {
  const response = await fetchJson<FrankerFaceZRoomResponse>(
    `https://api.frankerfacez.com/v1/room/id/${encodeURIComponent(roomId)}`
  )
  return compactFrankerFaceZEmotes(
    extractFrankerFaceZEmotes(response.sets).map((emote) =>
      mapFrankerFaceZEmote(emote)
    )
  )
}

function mapSevenTvEmote(emote: SevenTvEmote): EmoteCatalogEntry | null {
  const imageUrl = buildSevenTvImageUrl(emote.data?.host)
  if (!imageUrl) return null

  const owner = emote.data?.owner
  const twitchConnection = owner?.connections?.find(
    (connection) => connection.platform === "TWITCH"
  )

  return {
    id: emote.id,
    code: emote.name,
    provider: "7tv",
    imageUrl,
    aliases: emote.data?.alias,
    ownerName: owner?.display_name ?? owner?.username,
    ownerLogin: twitchConnection?.username ?? owner?.username,
    seventvFlags: emote.data?.flags,
    listed: emote.data?.listed ?? true,
  }
}

function compactSevenTvEmotes(
  entries: Array<EmoteCatalogEntry | null>
): EmoteCatalogEntry[] {
  const { showUnlistedEmotes } = thirdPartyEmoteFetchOptions

  return entries.flatMap((emote) =>
    emote !== null && (showUnlistedEmotes || emote.listed !== false)
      ? [emote]
      : []
  )
}

async function fetchSevenTvGlobalEmotes(): Promise<EmoteCatalogEntry[]> {
  const response = await fetchJson<SevenTvEmoteSet>(
    "https://7tv.io/v3/emote-sets/global"
  )
  return compactSevenTvEmotes(
    (response.emotes ?? []).map((emote) => mapSevenTvEmote(emote))
  )
}

async function fetchSevenTvRoomEmotes(
  roomId: string
): Promise<EmoteCatalogEntry[]> {
  const response = await fetchJson<SevenTvUserResponse>(
    `https://7tv.io/v3/users/twitch/${encodeURIComponent(roomId)}`
  )

  const emoteSetId = response.emote_set?.id?.trim() ?? ""
  const seventvUserId = response.user?.id?.trim() ?? ""
  const twitchConnectionIndex = (response.user?.connections ?? []).findIndex(
    (connection) => connection.platform === "TWITCH"
  )

  if (emoteSetId || seventvUserId) {
    setSevenTvRoomBinding(roomId, {
      emoteSetId,
      seventvUserId,
      twitchConnectionIndex: Math.max(twitchConnectionIndex, 0),
    })
  } else {
    clearSevenTvRoomBinding(roomId)
  }

  return compactSevenTvEmotes(
    (response.emote_set?.emotes ?? []).map((emote) => mapSevenTvEmote(emote))
  )
}

function setSevenTvRoomBinding(roomId: string, binding: SevenTvRoomBinding) {
  const previous = roomSevenTvBindings.get(roomId)
  if (previous) {
    removeRoomFromIndex(sevenTvEmoteSetRooms, previous.emoteSetId, roomId)
    removeRoomFromIndex(sevenTvUserRooms, previous.seventvUserId, roomId)
  }

  roomSevenTvBindings.set(roomId, binding)
  addRoomToIndex(sevenTvEmoteSetRooms, binding.emoteSetId, roomId)
  addRoomToIndex(sevenTvUserRooms, binding.seventvUserId, roomId)
}

function clearSevenTvRoomBinding(roomId: string) {
  const previous = roomSevenTvBindings.get(roomId)
  if (!previous) return

  roomSevenTvBindings.delete(roomId)
  removeRoomFromIndex(sevenTvEmoteSetRooms, previous.emoteSetId, roomId)
  removeRoomFromIndex(sevenTvUserRooms, previous.seventvUserId, roomId)
}

function clearAllSevenTvRoomBindings() {
  roomSevenTvBindings.clear()
  sevenTvEmoteSetRooms.clear()
  sevenTvUserRooms.clear()
}

function addRoomToIndex(
  index: Map<string, Set<string>>,
  key: string,
  roomId: string
) {
  const normalized = key.trim()
  if (!normalized) return
  let rooms = index.get(normalized)
  if (!rooms) {
    rooms = new Set()
    index.set(normalized, rooms)
  }
  rooms.add(roomId)
}

function removeRoomFromIndex(
  index: Map<string, Set<string>>,
  key: string,
  roomId: string
) {
  const normalized = key.trim()
  if (!normalized) return
  const rooms = index.get(normalized)
  if (!rooms) return
  rooms.delete(roomId)
  if (rooms.size === 0) {
    index.delete(normalized)
  }
}

function extractFrankerFaceZGlobalEmotes(
  response: FrankerFaceZGlobalResponse
): FrankerFaceZEmote[] {
  const defaultSets = new Set((response.default_sets ?? []).map(String))

  return Object.entries(response.sets ?? {}).flatMap(([setId, set]) =>
    defaultSets.size === 0 || defaultSets.has(setId)
      ? (set.emoticons ?? [])
      : []
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

  const file =
    host.files?.find((candidate) => candidate.name.startsWith("1x.")) ??
    host.files?.[0]

  if (!file?.name) {
    return ""
  }

  return `https:${host.url}/${file.name}`
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await devLoggedFetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  return (await response.json()) as T
}
