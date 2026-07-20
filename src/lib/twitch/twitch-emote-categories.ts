import type { TwitchChatEmote } from "@/lib/twitch/twitch-api"

export type TwitchUserEmoteCategoryDefinition = {
  id: string
  label: string
  /** Matches Helix `emote_type` values from Get User Emotes. */
  emoteTypes: readonly string[]
}

/** User entitlement emote categories shown between channel subs and globals. */
export const TWITCH_USER_EMOTE_CATEGORIES: TwitchUserEmoteCategoryDefinition[] =
  [
    {
      id: "twitch-bits",
      label: "Bits",
      emoteTypes: ["bitstier"],
    },
    {
      id: "twitch-hype-train",
      label: "Hype Train",
      emoteTypes: ["hypetrain"],
    },
    {
      id: "twitch-limited-time",
      label: "Limited time",
      emoteTypes: ["limitedtime"],
    },
    {
      id: "twitch-rewards",
      label: "Rewards",
      emoteTypes: ["rewards"],
    },
    {
      id: "twitch-prime",
      label: "Prime Gaming",
      emoteTypes: ["prime"],
    },
    {
      id: "twitch-turbo",
      label: "Turbo",
      emoteTypes: ["turbo"],
    },
    {
      id: "twitch-two-factor",
      label: "Two-factor auth",
      emoteTypes: ["twofactor"],
    },
    {
      id: "twitch-channel-points",
      label: "Channel points",
      emoteTypes: ["channelpoints"],
    },
  ]

const EMOTE_TYPE_TO_CATEGORY_ID = new Map<string, string>(
  TWITCH_USER_EMOTE_CATEGORIES.flatMap((category) =>
    category.emoteTypes.map((type) => [type, category.id] as const)
  )
)

const KNOWN_CATEGORY_IDS = new Set(
  TWITCH_USER_EMOTE_CATEGORIES.map((category) => category.id)
)

const CHANNEL_OWNED_EMOTE_TYPES = new Set([
  "subscriptions",
  "follower",
  "channelpoints",
])

/** Emote types already represented elsewhere in the picker. */
const SKIPPED_USER_EMOTE_TYPES = new Set(["smilies"])

export function normalizeTwitchEmoteType(
  emoteType: string | undefined
): string {
  return emoteType?.trim().toLowerCase() ?? ""
}

export function getTwitchUserEmoteCategoryId(
  emoteType: string | undefined
): string | null {
  const normalized = normalizeTwitchEmoteType(emoteType)
  if (!normalized) {
    return null
  }

  return EMOTE_TYPE_TO_CATEGORY_ID.get(normalized) ?? `twitch-type-${normalized}`
}

export function isKnownTwitchUserEmoteCategoryId(categoryId: string): boolean {
  return KNOWN_CATEGORY_IDS.has(categoryId)
}

export function isChannelOwnedTwitchEmoteType(
  emoteType: string | undefined
): boolean {
  return CHANNEL_OWNED_EMOTE_TYPES.has(normalizeTwitchEmoteType(emoteType))
}

export function formatTwitchEmoteTypeLabel(emoteType: string): string {
  switch (emoteType) {
    case "owl2019":
      return "Overwatch League 2019"
    case "bitstier":
      return "Bits"
    case "hypetrain":
      return "Hype Train"
    case "limitedtime":
      return "Limited time"
    case "channelpoints":
      return "Channel points"
    case "twofactor":
      return "Two-factor auth"
    default:
      return emoteType
        .replace(/([a-z])([0-9])/gi, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
  }
}

export function getTwitchUserEmoteCategoryLabel(categoryId: string): string {
  const known = TWITCH_USER_EMOTE_CATEGORIES.find(
    (category) => category.id === categoryId
  )
  if (known) {
    return known.label
  }

  if (categoryId.startsWith("twitch-type-")) {
    return formatTwitchEmoteTypeLabel(categoryId.slice("twitch-type-".length))
  }

  return categoryId
}

export type UnclaimedTwitchUserEmoteBuckets = {
  entitlement: Map<string, TwitchChatEmote[]>
  channelPointsByOwner: Map<string, TwitchChatEmote[]>
  otherChannelSubsByOwner: Map<string, TwitchChatEmote[]>
  extraGlobals: TwitchChatEmote[]
}

export function bucketUnclaimedTwitchUserEmotes(
  emotes: TwitchChatEmote[],
  roomId: string
): UnclaimedTwitchUserEmoteBuckets {
  const entitlement = new Map<string, TwitchChatEmote[]>()
  const channelPointsByOwner = new Map<string, TwitchChatEmote[]>()
  const otherChannelSubsByOwner = new Map<string, TwitchChatEmote[]>()
  const extraGlobals: TwitchChatEmote[] = []

  for (const emote of emotes) {
    const type = normalizeTwitchEmoteType(emote.emoteType)

    if (SKIPPED_USER_EMOTE_TYPES.has(type)) {
      continue
    }

    if (type === "globals") {
      extraGlobals.push(emote)
      continue
    }

    if (type === "subscriptions" || type === "follower") {
      if (emote.ownerId && emote.ownerId !== roomId) {
        const bucket = otherChannelSubsByOwner.get(emote.ownerId) ?? []
        bucket.push(emote)
        otherChannelSubsByOwner.set(emote.ownerId, bucket)
      }
      continue
    }

    if (type === "channelpoints" && emote.ownerId && emote.ownerId !== roomId) {
      const bucket = channelPointsByOwner.get(emote.ownerId) ?? []
      bucket.push(emote)
      channelPointsByOwner.set(emote.ownerId, bucket)
      continue
    }

    const categoryId = getTwitchUserEmoteCategoryId(type)
    if (!categoryId) {
      continue
    }

    const bucket = entitlement.get(categoryId) ?? []
    bucket.push(emote)
    entitlement.set(categoryId, bucket)
  }

  return {
    entitlement,
    channelPointsByOwner,
    otherChannelSubsByOwner,
    extraGlobals,
  }
}
