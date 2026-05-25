import {
  getThirdPartyEmoteSets,
  type EmoteCatalogEntry,
  type ThirdPartyEmoteSets,
  type TwitchEmoteHydration,
} from "@/lib/chat-emotes"
import {
  fetchAllUserChatEmotes,
  fetchChannelChatEmotes,
  fetchGlobalChatEmotes,
  fetchTwitchUsersById,
  fetchTwitchUsersByLogin,
  fetchUserChatEmotes,
  isFollowerChannelEmote,
  isSubscriptionChannelEmote,
  type TwitchChatEmote,
  type TwitchUser,
} from "@/lib/twitch-api"
import { sortPickerEmotes } from "@/lib/emote-picker-layout"
import type { TwitchEmoteProvider } from "@/lib/twitch-chat"

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

const PLATFORM_META: Record<
  EmotePickerPlatformId,
  { label: string; iconSrc: string }
> = {
  twitch: { label: "Twitch", iconSrc: "/icons/twitch.svg" },
  "7tv": { label: "7TV", iconSrc: "/icons/7tv.svg" },
  bttv: { label: "BTTV", iconSrc: "/icons/bttv.svg" },
  ffz: { label: "FFZ", iconSrc: "/icons/ffz.svg" },
}

export function createEmptyComposerCatalog(): ComposerEmoteCatalog {
  return { platforms: [], byCode: new Map(), twitchById: new Map() }
}

export async function fetchComposerEmoteCatalog(
  options: ComposerEmoteLoadOptions
): Promise<ComposerEmoteCatalog> {
  const { roomId, channelLogin, accessToken, clientId, userId } = options
  const canLoadTwitch = Boolean(accessToken?.trim() && clientId?.trim())

  const [thirdPartySets, twitchGlobal, twitchChannelRaw, twitchUserAll, twitchUserChannel] =
    await Promise.all([
      getThirdPartyEmoteSets(roomId),
      canLoadTwitch
        ? fetchGlobalChatEmotes(accessToken!, clientId!).catch(() => [])
        : Promise.resolve([]),
      canLoadTwitch
        ? fetchChannelChatEmotes(roomId, accessToken!, clientId!).catch(() => [])
        : Promise.resolve([]),
      canLoadTwitch && userId
        ? fetchAllUserChatEmotes(userId, accessToken!, clientId!).catch(() => [])
        : Promise.resolve([]),
      canLoadTwitch && userId
        ? fetchUserChatEmotes(userId, accessToken!, clientId!, roomId).catch(
            () => []
          )
        : Promise.resolve([]),
    ])

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

  return buildComposerCatalog({
    channelLogin,
    thirdPartySets: dedupeThirdPartySets(thirdPartySets),
    twitchCategories,
    currentChannelProfile: profiles.get(roomId),
  })
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

async function resolveBroadcasterProfiles(options: {
  accessToken: string
  clientId: string
  roomId: string
  channelLogin: string
  hints: ChannelProfileHint[]
  ownerIds: string[]
}): Promise<Map<string, TwitchUser>> {
  const profiles = new Map<string, TwitchUser>()

  const loginsToFetch = [
    ...new Set(
      [
        options.channelLogin,
        ...options.hints.map((hint) => hint.login),
      ]
        .map((login) => login.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean)
    ),
  ]

  const byLogin = await fetchTwitchUsersByLogin(
    loginsToFetch,
    options.accessToken,
    options.clientId
  ).catch(() => [] as TwitchUser[])

  for (const user of byLogin) {
    profiles.set(user.id, user)
  }

  const missingOwnerIds = options.ownerIds.filter((id) => !profiles.has(id))
  if (missingOwnerIds.length > 0) {
    const byId = await fetchTwitchUsersById(
      missingOwnerIds,
      options.accessToken,
      options.clientId
    ).catch(() => [] as TwitchUser[])

    for (const user of byId) {
      profiles.set(user.id, user)
    }
  }

  const currentByLogin = [...profiles.values()].find(
    (user) => user.login === options.channelLogin.toLowerCase()
  )
  if (currentByLogin) {
    profiles.set(options.roomId, currentByLogin)
  }

  return profiles
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
    const sorted = sortPickerEmotes(draft.emotes.map(toComposerEmote))

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
  const login = sources.channelLogin

  const registerEmotes = (emotes: ComposerEmote[]) => {
    for (const emote of emotes) {
      byCode.set(emote.code, emote)
      if (emote.provider === "twitch") {
        twitchById.set(emote.id, emote)
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

  return { platforms, byCode, twitchById }
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
      const sorted = sortPickerEmotes(channel)
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
      const sorted = sortPickerEmotes(global)
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

function toComposerEmote(emote: TwitchChatEmote): ComposerEmote {
  return {
    id: emote.id,
    code: emote.name,
    provider: "twitch",
    imageUrl: emote.imageUrl,
  }
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
