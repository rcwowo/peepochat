import { devFetchLogger } from "@/lib/dev-logger"
import {
  buildThirdPartyEmoteCatalog,
  getThirdPartyEmoteSets,
  type EmoteCatalogEntry,
  type ThirdPartyEmoteCatalog,
  type ThirdPartyEmoteSets,
  type TwitchEmoteHydration,
} from "@/lib/chat/chat-emotes"
import {
  isFollowerChannelEmote,
  isSubscriptionChannelEmote,
  type TwitchChatEmote,
  type TwitchUser,
} from "@/lib/twitch/twitch-api"
import { resolveBroadcasterProfiles } from "@/lib/twitch/twitch-broadcaster-profiles"
import { loadTwitchEmotesForComposer } from "@/lib/twitch/twitch-emote-session"

export {
  clearChannelTwitchEmoteCache,
  clearTwitchEmoteSessionCache,
} from "@/lib/twitch/twitch-emote-session"
export { clearBroadcasterProfileCache } from "@/lib/twitch/twitch-broadcaster-profiles"
import { sortPickerEmotes } from "@/lib/chat/emote-picker-layout"
import { EMOTE_PLATFORM_META } from "@/lib/chat/emote-platform-meta"
import type { TwitchEmoteProvider } from "@/lib/twitch/twitch-chat"

/**
 * Emote cache invalidation (keep layers in sync):
 *
 * | Event | third-party (`chat-emotes`) | Helix (`twitch-emote-session`) | profiles | room bundle (this file) |
 * |-------|------------------------------|--------------------------------|----------|-------------------------|
 * | Logout / disconnect all channels | clear all | clear all | clear all | clear all |
 * | Auth token / user change | — | clear all | clear all | clear all |
 * | Emote provider toggles | — | — | — | refresh per channel via hook |
 * | Manual refresh / per-room reload | clear room | clear room channel | — | clear room |
 */

export type ComposerEmote = EmoteCatalogEntry

export type EmotePickerCategory = {
  id: string
  /** Tooltip and screen-reader label */
  label: string
  iconSrc: string
  iconAlt: string
  emotes: ComposerEmote[]
}

export type EmotePickerPlatformId = TwitchEmoteProvider

export type EmotePickerPlatform = {
  id: EmotePickerPlatformId
  label: string
  iconSrc: string
  categories: EmotePickerCategory[]
}

export type ComposerEmoteCatalog = {
  platforms: EmotePickerPlatform[]
  byCode: Map<string, ComposerEmote>
  twitchById: Map<string, ComposerEmote>
  thirdPartyById: Map<string, ComposerEmote>
}

export type ChannelProfileHint = {
  login: string
  displayName?: string
  profileImageUrl?: string
}

export type ComposerEmoteLoadOptions = {
  roomId: string
  channelLogin: string
  accessToken?: string
  clientId?: string
  userId?: string
  channelHints?: ChannelProfileHint[]
}

type CategoryIconRef =
  | { kind: "platform"; platformId: EmotePickerPlatformId }
  | { kind: "broadcaster"; ownerId: string }
  | { kind: "current-channel" }

type CategoryDraft = {
  id: string
  label: string
  emotes: TwitchChatEmote[]
  icon: CategoryIconRef
}

const PLATFORM_META = EMOTE_PLATFORM_META

export function createEmptyComposerCatalog(): ComposerEmoteCatalog {
  return {
    platforms: [],
    byCode: new Map(),
    twitchById: new Map(),
    thirdPartyById: new Map(),
  }
}

export type RoomEmoteBundle = {
  composer: ComposerEmoteCatalog
  thirdParty: ThirdPartyEmoteCatalog
}

const roomEmoteBundleCache = new Map<string, RoomEmoteBundle>()
const roomEmoteBundleInflight = new Map<string, Promise<RoomEmoteBundle>>()

export function clearRoomEmoteBundleCache(roomId?: string) {
  if (roomId) {
    for (const key of roomEmoteBundleCache.keys()) {
      if (key.startsWith(`${roomId}:`)) {
        roomEmoteBundleCache.delete(key)
      }
    }
    for (const key of roomEmoteBundleInflight.keys()) {
      if (key.startsWith(`${roomId}:`)) {
        roomEmoteBundleInflight.delete(key)
      }
    }
    return
  }

  roomEmoteBundleCache.clear()
  roomEmoteBundleInflight.clear()
}

/** @deprecated Use clearRoomEmoteBundleCache */
export function clearRoomEmoteBundleInflight() {
  clearRoomEmoteBundleCache()
}

function roomEmoteBundleKey(options: ComposerEmoteLoadOptions) {
  const userId = options.userId?.trim() ?? ""
  return `${options.roomId}:${userId}`
}

/** One network pass per room: third-party + Twitch Helix + profiles (deduped in-flight). */
export async function fetchRoomEmoteBundle(
  options: ComposerEmoteLoadOptions
): Promise<RoomEmoteBundle> {
  const key = roomEmoteBundleKey(options)

  const cached = roomEmoteBundleCache.get(key)
  if (cached) {
    devFetchLogger.debugLazy(() => [
      "room-emotes:cache-hit",
      {
        roomId: options.roomId,
        channel: options.channelLogin,
        emoteCount: cached.composer.byCode.size,
      },
    ])
    return cached
  }

  const pending = roomEmoteBundleInflight.get(key)
  if (pending) {
    devFetchLogger.debugLazy(() => [
      "room-emotes:inflight",
      {
        roomId: options.roomId,
        channel: options.channelLogin,
      },
    ])
    return pending
  }

  devFetchLogger.debugLazy(() => [
    "room-emotes:start",
    {
      roomId: options.roomId,
      channel: options.channelLogin,
      hasAuth: Boolean(options.accessToken?.trim() && options.clientId?.trim()),
    },
  ])

  const promise = buildRoomEmoteBundle(options)
    .then((bundle) => {
      roomEmoteBundleCache.set(key, bundle)
      devFetchLogger.debugLazy(() => [
        "room-emotes:success",
        {
          roomId: options.roomId,
          channel: options.channelLogin,
          emoteCount: bundle.composer.byCode.size,
          thirdPartyEmoteCount: bundle.thirdParty.size,
        },
      ])
      return bundle
    })
    .finally(() => {
      if (roomEmoteBundleInflight.get(key) === promise) {
        roomEmoteBundleInflight.delete(key)
      }
    })

  roomEmoteBundleInflight.set(key, promise)
  return promise
}

export async function fetchComposerEmoteCatalog(
  options: ComposerEmoteLoadOptions
): Promise<ComposerEmoteCatalog> {
  return (await fetchRoomEmoteBundle(options)).composer
}

async function buildRoomEmoteBundle(
  options: ComposerEmoteLoadOptions
): Promise<RoomEmoteBundle> {
  const { roomId, channelLogin, accessToken, clientId, userId } = options
  const canLoadTwitch = Boolean(accessToken?.trim() && clientId?.trim())

  const [thirdPartySets, twitchEmotes] = await Promise.all([
    getThirdPartyEmoteSets(roomId),
    canLoadTwitch
      ? loadTwitchEmotesForComposer({
          roomId,
          accessToken,
          clientId,
          userId,
        })
      : Promise.resolve({
          global: [],
          userAll: [],
          channel: [],
          userChannel: [],
        }),
  ])

  const thirdParty = buildThirdPartyEmoteCatalog(thirdPartySets)

  const {
    global: twitchGlobal,
    channel: twitchChannelRaw,
    userAll: twitchUserAll,
    userChannel: twitchUserChannel,
  } = twitchEmotes

  const twitchDrafts = partitionTwitchEmotes({
    roomId,
    channelLogin,
    channelEmotes: twitchChannelRaw,
    userChannelEmotes: twitchUserChannel,
    userAllEmotes: twitchUserAll,
    globalEmotes: twitchGlobal,
  })

  const profiles = canLoadTwitch
    ? await resolveBroadcasterProfiles({
        accessToken: accessToken!,
        clientId: clientId!,
        roomId,
        channelLogin,
        hints: options.channelHints ?? [],
        ownerIds: collectBroadcasterOwnerIds(twitchDrafts),
      })
    : new Map<string, TwitchUser>()

  const twitchCategories = reorderTwitchCategories(
    resolveCategoryDrafts(twitchDrafts, profiles, roomId, channelLogin),
    channelLogin
  )

  const composer = buildComposerCatalog({
    channelLogin,
    thirdPartySets: dedupeThirdPartySets(thirdPartySets),
    twitchCategories,
    currentChannelProfile: profiles.get(roomId),
  })

  return { composer, thirdParty }
}

function collectBroadcasterOwnerIds(drafts: CategoryDraft[]): string[] {
  const ownerIds: string[] = []

  for (const draft of drafts) {
    if (draft.icon.kind === "broadcaster") {
      ownerIds.push(draft.icon.ownerId)
    }
  }

  return [...new Set(ownerIds)]
}

function reorderTwitchCategories(
  categories: EmotePickerCategory[],
  channelLogin: string
): EmotePickerCategory[] {
  const channelOrder = [
    `twitch-channel-sub-${channelLogin}`,
    `twitch-channel-follower-${channelLogin}`,
    `twitch-channel-unlocks-${channelLogin}`,
  ]

  const channel = channelOrder
    .map((id) => categories.find((category) => category.id === id))
    .filter((category): category is EmotePickerCategory => Boolean(category))

  const subs = categories
    .filter((category) => category.id.startsWith("twitch-sub-"))
    .sort((left, right) => left.label.localeCompare(right.label))

  const global = categories.find((category) => category.id === "twitch-global")

  return [...channel, ...subs, ...(global ? [global] : [])]
}

function partitionTwitchEmotes(sources: {
  roomId: string
  channelLogin: string
  channelEmotes: TwitchChatEmote[]
  userChannelEmotes: TwitchChatEmote[]
  userAllEmotes: TwitchChatEmote[]
  globalEmotes: TwitchChatEmote[]
}): CategoryDraft[] {
  const claimed = new Set<string>()
  const { roomId, channelLogin, channelEmotes, userChannelEmotes, userAllEmotes, globalEmotes } =
    sources
  const drafts: CategoryDraft[] = []

  const claim = (emotes: TwitchChatEmote[]) => {
    const result: TwitchChatEmote[] = []
    for (const emote of emotes) {
      const key = emote.name.toLowerCase()
      if (claimed.has(key)) continue
      claimed.add(key)
      result.push(emote)
    }
    return result
  }

  const pushDraft = (draft: Omit<CategoryDraft, "emotes"> & { emotes: TwitchChatEmote[] }) => {
    const emotes = claim(draft.emotes)
    if (emotes.length === 0) return
    drafts.push({ ...draft, emotes })
  }

  const subscriptionCodesOnChannel = new Set(
    channelEmotes
      .filter((emote) => isSubscriptionChannelEmote(emote))
      .map((emote) => emote.name.toLowerCase())
  )

  pushDraft({
    id: `twitch-channel-sub-${channelLogin}`,
    label: `${channelLogin} subscriber`,
    icon: { kind: "current-channel" },
    emotes: userChannelEmotes.filter((emote) =>
      subscriptionCodesOnChannel.has(emote.name.toLowerCase())
    ),
  })

  const followerCodesOnChannel = new Set(
    channelEmotes
      .filter((emote) => isFollowerChannelEmote(emote))
      .map((emote) => emote.name.toLowerCase())
  )

  pushDraft({
    id: `twitch-channel-follower-${channelLogin}`,
    label: `${channelLogin} follower`,
    icon: { kind: "current-channel" },
    emotes: userChannelEmotes.filter(
      (emote) =>
        emote.ownerId === roomId &&
        (isFollowerChannelEmote(emote) ||
          followerCodesOnChannel.has(emote.name.toLowerCase()))
    ),
  })

  pushDraft({
    id: `twitch-channel-unlocks-${channelLogin}`,
    label: `${channelLogin} unlocks`,
    icon: { kind: "current-channel" },
    emotes: userChannelEmotes.filter(
      (emote) =>
        !isSubscriptionChannelEmote(emote) &&
        !isFollowerChannelEmote(emote) &&
        emote.ownerId === roomId
    ),
  })

  const globallyUsableOtherChannelKeys = new Set<string>()
  for (const emote of userChannelEmotes) {
    if (!emote.ownerId || emote.ownerId === roomId) continue
    globallyUsableOtherChannelKeys.add(
      `${emote.ownerId}:${emote.name.toLowerCase()}`
    )
  }

  const subsByOwner = new Map<string, TwitchChatEmote[]>()
  for (const emote of userAllEmotes) {
    if (!emote.ownerId || emote.ownerId === roomId) continue

    const emoteKey = `${emote.ownerId}:${emote.name.toLowerCase()}`
    const isSubEmote = isSubscriptionChannelEmote(emote)
    const isFollowerUnlockedAsSub =
      isFollowerChannelEmote(emote) && globallyUsableOtherChannelKeys.has(emoteKey)

    if (!isSubEmote && !isFollowerUnlockedAsSub) continue

    const bucket = subsByOwner.get(emote.ownerId) ?? []
    bucket.push(emote)
    subsByOwner.set(emote.ownerId, bucket)
  }

  for (const ownerId of subsByOwner.keys()) {
    pushDraft({
      id: `twitch-sub-${ownerId}`,
      label: "Sub emotes",
      icon: { kind: "broadcaster", ownerId },
      emotes: subsByOwner.get(ownerId) ?? [],
    })
  }

  pushDraft({
    id: "twitch-global",
    label: "Twitch global",
    icon: { kind: "platform", platformId: "twitch" },
    emotes: globalEmotes,
  })

  return drafts
}

function resolveCategoryDrafts(
  drafts: CategoryDraft[],
  profiles: Map<string, TwitchUser>,
  roomId: string,
  channelLogin: string
): EmotePickerCategory[] {
  const currentProfile =
    profiles.get(roomId) ??
    [...profiles.values()].find((user) => user.login === channelLogin.toLowerCase())

  return drafts.map((draft) => {
    const icon = resolveCategoryIcon(draft.icon, profiles, currentProfile, channelLogin)
    const sorted = dedupeComposerEmotes(
      sortPickerEmotes(draft.emotes.map((emote) => toComposerEmote(emote, profiles)))
    )

    return {
      id: draft.id,
      label: icon.alt,
      iconSrc: icon.src,
      iconAlt: icon.alt,
      emotes: sorted,
    }
  })
}

function resolveCategoryIcon(
  icon: CategoryIconRef,
  profiles: Map<string, TwitchUser>,
  currentProfile: TwitchUser | undefined,
  channelLogin: string
): { src: string; alt: string } {
  if (icon.kind === "platform") {
    const meta = PLATFORM_META[icon.platformId]
    return { src: meta.iconSrc, alt: meta.label }
  }

  if (icon.kind === "current-channel") {
    if (currentProfile?.profileImageUrl) {
      return {
        src: currentProfile.profileImageUrl,
        alt: currentProfile.displayName || channelLogin,
      }
    }
    return { src: PLATFORM_META.twitch.iconSrc, alt: channelLogin }
  }

  const profile = profiles.get(icon.ownerId)
  if (profile?.profileImageUrl) {
    return {
      src: profile.profileImageUrl,
      alt: profile.displayName || profile.login,
    }
  }

  return { src: PLATFORM_META.twitch.iconSrc, alt: "Channel" }
}

function dedupeThirdPartySets(sets: ThirdPartyEmoteSets): ThirdPartyEmoteSets {
  const result = { ...sets }

  for (const provider of ["7tv", "bttv", "ffz"] as const) {
    const channelCodes = new Set(
      result[provider].channel.map((emote) => emote.code.toLowerCase())
    )
    result[provider] = {
      channel: result[provider].channel,
      global: result[provider].global.filter(
        (emote) => !channelCodes.has(emote.code.toLowerCase())
      ),
    }
  }

  return result
}

export function buildComposerCatalog(sources: {
  channelLogin: string
  thirdPartySets: ThirdPartyEmoteSets
  twitchCategories: EmotePickerCategory[]
  currentChannelProfile?: TwitchUser
}): ComposerEmoteCatalog {
  const byCode = new Map<string, ComposerEmote>()
  const twitchById = new Map<string, ComposerEmote>()
  const thirdPartyById = new Map<string, ComposerEmote>()
  const login = sources.channelLogin

  const registerEmotes = (emotes: ComposerEmote[]) => {
    for (const emote of emotes) {
      byCode.set(emote.code, emote)
      if (emote.provider === "twitch") {
        twitchById.set(emote.id, emote)
      } else {
        thirdPartyById.set(`${emote.provider}:${emote.id}`, emote)
      }
    }
  }

  for (const category of sources.twitchCategories) {
    registerEmotes(category.emotes)
  }

  const thirdPartyPlatforms = buildThirdPartyPlatforms(
    sources.thirdPartySets,
    login,
    sources.currentChannelProfile,
    registerEmotes
  )

  const platforms: EmotePickerPlatform[] = []

  if (sources.twitchCategories.length > 0) {
    platforms.push({
      id: "twitch",
      ...PLATFORM_META.twitch,
      categories: sources.twitchCategories,
    })
  }

  platforms.push(...thirdPartyPlatforms)

  return { platforms, byCode, twitchById, thirdPartyById }
}

function buildThirdPartyPlatforms(
  sets: ThirdPartyEmoteSets,
  channelLogin: string,
  currentChannelProfile: TwitchUser | undefined,
  registerEmotes: (emotes: ComposerEmote[]) => void
): EmotePickerPlatform[] {
  const platforms: EmotePickerPlatform[] = []
  const channelIconSrc =
    currentChannelProfile?.profileImageUrl ?? undefined
  const channelIconAlt =
    currentChannelProfile?.displayName ?? channelLogin

  for (const provider of ["7tv", "bttv", "ffz"] as const) {
    const { channel, global } = sets[provider]
    const categories: EmotePickerCategory[] = []
    const meta = PLATFORM_META[provider]

    if (channel.length > 0) {
      const sorted = dedupeComposerEmotes(
        sortPickerEmotes(channel)
      )
      const id = `${provider}-channel-${channelLogin}`
      categories.push({
        id,
        label: `#${channelLogin}`,
        iconSrc: channelIconSrc ?? meta.iconSrc,
        iconAlt: channelIconAlt,
        emotes: sorted,
      })
      registerEmotes(sorted)
    }

    if (global.length > 0) {
      const sorted = dedupeComposerEmotes(sortPickerEmotes(global))
      const id = `${provider}-global`
      categories.push({
        id,
        label: `${meta.label} global`,
        iconSrc: meta.iconSrc,
        iconAlt: meta.label,
        emotes: sorted,
      })
      registerEmotes(sorted)
    }

    if (categories.length > 0) {
      platforms.push({
        id: provider,
        ...meta,
        categories,
      })
    }
  }

  return platforms
}

function toComposerEmote(
  emote: TwitchChatEmote,
  profiles?: Map<string, TwitchUser>
): ComposerEmote {
  const ownerId = emote.ownerId
  const ownerProfile = ownerId ? profiles?.get(ownerId) : undefined

  return {
    id: emote.id,
    code: emote.name,
    provider: "twitch",
    imageUrl: emote.imageUrl,
    ownerId,
    ownerLogin: ownerProfile?.login,
    ownerName: ownerProfile?.displayName || ownerProfile?.login,
  }
}

function dedupeComposerEmotes(emotes: ComposerEmote[]): ComposerEmote[] {
  const seen = new Set<string>()
  const result: ComposerEmote[] = []

  for (const emote of emotes) {
    const key = `${emote.provider}:${emote.id}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(emote)
  }

  return result
}

export function getDefaultPickerSelection(catalog: ComposerEmoteCatalog): {
  platformId: EmotePickerPlatformId
  categoryId: string
} | null {
  const platform =
    catalog.platforms.find((entry) => entry.id === "twitch") ??
    catalog.platforms[0]

  if (!platform || platform.categories.length === 0) {
    return null
  }

  return {
    platformId: platform.id,
    categoryId: platform.categories[0]!.id,
  }
}

export function findPickerCategory(
  catalog: ComposerEmoteCatalog,
  platformId: EmotePickerPlatformId,
  categoryId: string
): EmotePickerCategory | null {
  const platform = catalog.platforms.find((entry) => entry.id === platformId)
  return platform?.categories.find((category) => category.id === categoryId) ?? null
}

export function getTwitchEmoteHydration(
  catalog: ComposerEmoteCatalog
): TwitchEmoteHydration | null {
  if (catalog.twitchById.size === 0) {
    return null
  }

  return {
    byCode: catalog.byCode,
    byId: catalog.twitchById,
  }
}
