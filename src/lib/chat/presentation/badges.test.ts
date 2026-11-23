import {
  afterEach,
  describe,
  expect,
  mock,
  setSystemTime,
  spyOn,
  test,
} from "bun:test"

import {
  buildBadgeCatalog,
  loadChannelBadgeCatalog,
  loadGlobalBadgeCatalog,
  mergeBadgeCatalogs,
  resolveMessageBadges,
} from "@/lib/chat/presentation/badges"
import type { TwitchChatBadgeSet } from "@/lib/twitch/auth/api"

const GLOBAL_KEY = "peepochat::badges::global"
const CHANNEL_KEY = "peepochat::badges::channel::123"
const NOW = Date.parse("2024-06-01T00:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000

function badgeSet(
  setId: string,
  versionIds: string[],
  title = setId
): TwitchChatBadgeSet {
  return {
    setId,
    versions: versionIds.map((id) => ({
      id,
      title: `${title} ${id}`,
      description: "",
      imageUrl: `https://example.test/${setId}/${id}/1`,
      imageUrl2x: `https://example.test/${setId}/${id}/2`,
      imageUrl4x: `https://example.test/${setId}/${id}/4`,
    })),
  }
}

function helixPayload(setId: string, versionId: string) {
  return {
    data: [
      {
        set_id: setId,
        versions: [
          {
            id: versionId,
            title: `${setId} ${versionId}`,
            description: "",
            image_url_1x: "1x",
            image_url_2x: "2x",
            image_url_4x: "4x",
          },
        ],
      },
    ],
  }
}

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockImplementation((() =>
    Promise.resolve(
      Response.json(body, { status })
    )) as unknown as typeof fetch)
}

function writeCache(key: string, cachedAt: number, sets: TwitchChatBadgeSet[]) {
  window.localStorage.setItem(
    key,
    JSON.stringify({ cachedAt: new Date(cachedAt).toISOString(), sets })
  )
}

afterEach(() => {
  mock.restore()
  setSystemTime()
})

describe("badge catalogs", () => {
  test("indexes every version of every set", () => {
    const catalog = buildBadgeCatalog([
      badgeSet("subscriber", ["0", "3"]),
      badgeSet("moderator", ["1"]),
    ])
    expect([...catalog.keys()]).toEqual([
      "subscriber:0",
      "subscriber:3",
      "moderator:1",
    ])
    expect(catalog.get("subscriber:3")).toMatchObject({
      id: "subscriber:3",
      setId: "subscriber",
      version: "3",
      imageUrl2x: "https://example.test/subscriber/3/2",
    })
  })

  test("channel badges override global badges with the same key", () => {
    const merged = mergeBadgeCatalogs(
      buildBadgeCatalog([
        badgeSet("subscriber", ["0"], "Global"),
        badgeSet("vip", ["1"]),
      ]),
      buildBadgeCatalog([badgeSet("subscriber", ["0"], "Channel")])
    )
    expect(merged.get("subscriber:0")?.title).toBe("Channel 0")
    expect(merged.get("vip:1")?.title).toBe("vip 1")
  })

  test("resolves message badges in order and skips unknown ones", () => {
    const catalog = buildBadgeCatalog([
      badgeSet("moderator", ["1"]),
      badgeSet("subscriber", ["12"]),
    ])
    const resolved = resolveMessageBadges(
      [
        { set: "subscriber", version: "12" },
        { set: "subscriber", version: "99" },
        { set: "moderator", version: "1" },
      ],
      catalog
    )
    expect(resolved.map((badge) => badge.id)).toEqual([
      "subscriber:12",
      "moderator:1",
    ])
  })
})

describe("loadGlobalBadgeCatalog", () => {
  test("uses a fresh cache without fetching", async () => {
    setSystemTime(new Date(NOW))
    writeCache(GLOBAL_KEY, NOW - 2 * DAY_MS, [badgeSet("vip", ["1"])])
    const fetchSpy = mockFetch(helixPayload("other", "1"))

    const catalog = await loadGlobalBadgeCatalog("token", "client")
    expect([...catalog.keys()]).toEqual(["vip:1"])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test("refetches and rewrites an expired cache", async () => {
    setSystemTime(new Date(NOW))
    writeCache(GLOBAL_KEY, NOW - 3 * DAY_MS - 1, [badgeSet("vip", ["1"])])
    const fetchSpy = mockFetch(helixPayload("partner", "1"))

    const catalog = await loadGlobalBadgeCatalog("token", "client")
    expect([...catalog.keys()]).toEqual(["partner:1"])
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const stored = JSON.parse(window.localStorage.getItem(GLOBAL_KEY)!)
    expect(stored.cachedAt).toBe(new Date(NOW).toISOString())
    expect(stored.sets[0].setId).toBe("partner")
  })

  test("ignores a corrupt cache entry", async () => {
    window.localStorage.setItem(GLOBAL_KEY, "{not json")
    mockFetch(helixPayload("partner", "1"))
    const catalog = await loadGlobalBadgeCatalog("token", "client")
    expect([...catalog.keys()]).toEqual(["partner:1"])
  })

  test("bypasses the cache when forced", async () => {
    setSystemTime(new Date(NOW))
    writeCache(GLOBAL_KEY, NOW, [badgeSet("vip", ["1"])])
    mockFetch(helixPayload("partner", "1"))
    const catalog = await loadGlobalBadgeCatalog("token", "client", true)
    expect([...catalog.keys()]).toEqual(["partner:1"])
  })

  test("propagates API failures without caching", async () => {
    mockFetch({}, 500)
    await expect(loadGlobalBadgeCatalog("token", "client")).rejects.toThrow()
    expect(window.localStorage.getItem(GLOBAL_KEY)).toBeNull()
  })
})

describe("loadChannelBadgeCatalog", () => {
  test("caches per broadcaster with a one day TTL", async () => {
    setSystemTime(new Date(NOW))
    writeCache(CHANNEL_KEY, NOW - DAY_MS, [badgeSet("subscriber", ["0"])])
    const fetchSpy = mockFetch(helixPayload("subscriber", "3"))

    const fresh = await loadChannelBadgeCatalog("123", "token", "client")
    expect([...fresh.keys()]).toEqual(["subscriber:0"])
    expect(fetchSpy).not.toHaveBeenCalled()

    setSystemTime(new Date(NOW + 1))
    const refetched = await loadChannelBadgeCatalog("123", "token", "client")
    expect([...refetched.keys()]).toEqual(["subscriber:3"])
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("broadcaster_id=123")
  })
})
