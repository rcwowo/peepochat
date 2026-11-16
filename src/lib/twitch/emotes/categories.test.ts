import { describe, expect, test } from "bun:test"

import type { TwitchChatEmote } from "@/lib/twitch/auth/api"
import {
  bucketUnclaimedTwitchUserEmotes,
  formatTwitchEmoteTypeLabel,
  getTwitchUserEmoteCategoryId,
  getTwitchUserEmoteCategoryLabel,
  isKnownTwitchUserEmoteCategoryId,
} from "@/lib/twitch/emotes/categories"

function userEmote(
  id: string,
  emoteType: string | undefined,
  ownerId?: string
): TwitchChatEmote {
  return {
    id,
    name: `emote${id}`,
    imageUrl: `https://emote/${id}`,
    formats: ["static"],
    emoteType,
    ownerId,
  }
}

function idsByKey(map: Map<string, TwitchChatEmote[]>) {
  return Object.fromEntries(
    [...map].map(([key, emotes]) => [key, emotes.map((emote) => emote.id)])
  )
}

describe("getTwitchUserEmoteCategoryId", () => {
  test("maps known Helix emote types after normalizing case and whitespace", () => {
    expect(getTwitchUserEmoteCategoryId("bitstier")).toBe("twitch-bits")
    expect(getTwitchUserEmoteCategoryId(" HypeTrain ")).toBe(
      "twitch-hype-train"
    )
    expect(getTwitchUserEmoteCategoryId("CHANNELPOINTS")).toBe(
      "twitch-channel-points"
    )
  })

  test("creates a dynamic category for unknown types", () => {
    const id = getTwitchUserEmoteCategoryId("Owl2019")

    expect(id).toBe("twitch-type-owl2019")
    expect(isKnownTwitchUserEmoteCategoryId(id!)).toBe(false)
    expect(isKnownTwitchUserEmoteCategoryId("twitch-prime")).toBe(true)
  })

  test("returns null for missing or blank types", () => {
    expect(getTwitchUserEmoteCategoryId(undefined)).toBeNull()
    expect(getTwitchUserEmoteCategoryId("   ")).toBeNull()
  })
})

describe("formatTwitchEmoteTypeLabel", () => {
  test("uses friendly names for known types", () => {
    expect(formatTwitchEmoteTypeLabel("owl2019")).toBe("Overwatch League 2019")
    expect(formatTwitchEmoteTypeLabel("twofactor")).toBe("Two-factor auth")
  })

  test("title-cases unknown types and separates trailing digits", () => {
    expect(formatTwitchEmoteTypeLabel("smilies")).toBe("Smilies")
    expect(formatTwitchEmoteTypeLabel("esports_event-name")).toBe(
      "Esports Event Name"
    )
    expect(formatTwitchEmoteTypeLabel("season2024")).toBe("Season 2024")
  })
})

describe("getTwitchUserEmoteCategoryLabel", () => {
  test("resolves known, dynamic and unrecognized category ids", () => {
    expect(getTwitchUserEmoteCategoryLabel("twitch-rewards")).toBe("Rewards")
    expect(getTwitchUserEmoteCategoryLabel("twitch-type-owl2019")).toBe(
      "Overwatch League 2019"
    )
    expect(getTwitchUserEmoteCategoryLabel("twitch-type-special_drop")).toBe(
      "Special Drop"
    )
    expect(getTwitchUserEmoteCategoryLabel("something-else")).toBe(
      "something-else"
    )
  })

  test("round-trips dynamic ids back to a readable label", () => {
    const id = getTwitchUserEmoteCategoryId("HypeTrain")!

    expect(getTwitchUserEmoteCategoryLabel(id)).toBe("Hype Train")
  })
})

describe("bucketUnclaimedTwitchUserEmotes", () => {
  test("routes emotes into entitlement, owner and global buckets", () => {
    const roomId = "1001"
    const buckets = bucketUnclaimedTwitchUserEmotes(
      [
        userEmote("smile", "smilies"),
        userEmote("global", "globals"),
        userEmote("own-sub", "subscriptions", roomId),
        userEmote("other-sub", "subscriptions", "2002"),
        userEmote("other-follower", "follower", "2002"),
        userEmote("third-sub", "Subscriptions", "3003"),
        userEmote("orphan-sub", "subscriptions"),
        userEmote("own-points", "channelpoints", roomId),
        userEmote("other-points", "channelpoints", "2002"),
        userEmote("bits", "bitstier", "4004"),
        userEmote("prime", " PRIME "),
        userEmote("owl", "owl2019"),
        userEmote("untyped", undefined),
      ],
      roomId
    )

    expect(buckets.extraGlobals.map((emote) => emote.id)).toEqual(["global"])
    expect(idsByKey(buckets.otherChannelSubsByOwner)).toEqual({
      "2002": ["other-sub", "other-follower"],
      "3003": ["third-sub"],
    })
    expect(idsByKey(buckets.channelPointsByOwner)).toEqual({
      "2002": ["other-points"],
    })
    expect(idsByKey(buckets.entitlement)).toEqual({
      "twitch-channel-points": ["own-points"],
      "twitch-bits": ["bits"],
      "twitch-prime": ["prime"],
      "twitch-type-owl2019": ["owl"],
    })
  })

  test("returns empty buckets for no emotes", () => {
    const buckets = bucketUnclaimedTwitchUserEmotes([], "1")

    expect(buckets.entitlement.size).toBe(0)
    expect(buckets.channelPointsByOwner.size).toBe(0)
    expect(buckets.otherChannelSubsByOwner.size).toBe(0)
    expect(buckets.extraGlobals).toEqual([])
  })
})
