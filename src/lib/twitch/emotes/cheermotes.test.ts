import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"

import { TwitchApiError } from "@/lib/twitch/auth/api"
import type { TwitchEmote } from "@/lib/twitch/chat/chat"
import {
  clearCheermoteCache,
  DEFAULT_CHEERMOTE_CATALOG,
  fetchCheermotes,
  hydrateCheermotes,
  type CheermoteCatalog,
} from "@/lib/twitch/emotes/cheermotes"

function twitchEmote(code: string, start: number, id = "25"): TwitchEmote {
  return {
    id,
    code,
    provider: "twitch",
    imageUrl: `https://emote/${id}`,
    start,
    end: start + code.length - 1,
  }
}

function helixTier(
  minBits: number,
  images: {
    animated?: Record<string, string>
    static?: Record<string, string>
  } | null
) {
  return {
    min_bits: minBits,
    id: String(minBits),
    color: `#${String(minBits).padStart(6, "0")}`,
    images: images ? { dark: images } : {},
  }
}

describe("DEFAULT_CHEERMOTE_CATALOG.match", () => {
  const { match } = DEFAULT_CHEERMOTE_CATALOG

  test("matches the prefix case-insensitively and picks the highest reached tier", () => {
    expect(match("Cheer1")?.tier.id).toBe("1")
    expect(match("cheer99")?.tier.id).toBe("1")
    expect(match("CHEER100")?.tier.id).toBe("100")
    expect(match("Cheer4999")?.tier.id).toBe("1000")
    expect(match("Cheer250000")?.tier.id).toBe("100000")
  })

  test("exposes the amount, canonical prefix and tier assets", () => {
    expect(match("cheer500")).toMatchObject({
      prefix: "Cheer",
      amount: 500,
      color: "#1db2a5",
      animatedUrl: expect.stringContaining("/animated/500/"),
      staticUrl: expect.stringContaining("/static/500/"),
    })
  })

  test("rejects codes without a valid positive amount", () => {
    for (const code of [
      "",
      "Cheer",
      "Cheer0",
      "Cheer01",
      "Cheer-5",
      "Cheer1.5",
      "Cheer100!",
      "Cheer 100",
      "Cheerful100",
      "Bleep100",
    ]) {
      expect(match(code)).toBeNull()
    }
  })
})

describe("hydrateCheermotes", () => {
  test("returns the message unchanged when it carries no bits", () => {
    const message = { text: "Cheer100", emotes: [], bits: null }

    expect(hydrateCheermotes(message, DEFAULT_CHEERMOTE_CATALOG)).toBe(message)
    const zero = { text: "Cheer100", emotes: [], bits: 0 }
    expect(hydrateCheermotes(zero, DEFAULT_CHEERMOTE_CATALOG)).toBe(zero)
  })

  test("returns the message unchanged when no cheer tokens are present", () => {
    const message = { text: "nice stream", emotes: [], bits: 100 }

    expect(hydrateCheermotes(message, DEFAULT_CHEERMOTE_CATALOG)).toBe(message)
  })

  test("inserts cheermote emotes in position order alongside existing emotes", () => {
    const text = "😀 Cheer100 gg Kappa cheer1"
    const result = hydrateCheermotes(
      { text, emotes: [twitchEmote("Kappa", 15)], bits: 101, extra: "kept" },
      DEFAULT_CHEERMOTE_CATALOG
    )

    expect(result.extra).toBe("kept")
    expect(
      result.emotes.map(({ id, code, start, end, cheermote }) => ({
        id,
        code,
        start,
        end,
        cheermote,
      }))
    ).toEqual([
      {
        id: "100",
        code: "Cheer100",
        start: 3,
        end: 10,
        cheermote: { prefix: "Cheer", amount: 100, color: "#9c3ee8" },
      },
      { id: "25", code: "Kappa", start: 15, end: 19, cheermote: undefined },
      {
        id: "1",
        code: "cheer1",
        start: 21,
        end: 26,
        cheermote: { prefix: "Cheer", amount: 1, color: "#979797" },
      },
    ])
    expect(text.slice(3, 11)).toBe("Cheer100")
  })

  test("converts an emote that exactly covers a cheer token and drops partial overlaps", () => {
    const result = hydrateCheermotes(
      {
        text: "Cheer100 Cheer5000",
        emotes: [
          { ...twitchEmote("Cheer100", 0, "7tv-1"), provider: "7tv" },
          twitchEmote("Cheer", 9, "partial"),
        ],
        bits: 5100,
      },
      DEFAULT_CHEERMOTE_CATALOG
    )

    expect(result.emotes).toHaveLength(2)
    expect(result.emotes[0]).toMatchObject({
      id: "100",
      code: "Cheer100",
      provider: "twitch",
      imageUrl: expect.stringContaining("/animated/100/"),
      cheermote: { amount: 100 },
    })
    expect(result.emotes[1]).toMatchObject({
      id: "5000",
      code: "Cheer5000",
      start: 9,
      end: 17,
    })
  })

  test("falls back to the default catalog when the given catalog is empty", () => {
    const empty: CheermoteCatalog = { sets: [], match: () => null }
    const result = hydrateCheermotes(
      { text: "Cheer100", emotes: [] as TwitchEmote[], bits: 100 },
      empty
    )

    expect(result.emotes.map((emote) => emote.id)).toEqual(["100"])
  })
})

describe("fetchCheermotes", () => {
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>

  beforeEach(() => {
    clearCheermoteCache()
    fetchSpy = spyOn(globalThis, "fetch")
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    clearCheermoteCache()
  })

  function respondWith(data: unknown, status = 200) {
    fetchSpy.mockImplementation(
      (async () =>
        new Response(JSON.stringify({ data }), {
          status,
        })) as unknown as typeof fetch
    )
  }

  test("builds a catalog from Helix data with unsorted tiers", async () => {
    respondWith([
      {
        prefix: "Corgo",
        tiers: [
          helixTier(1, {
            animated: { "1": "corgo-a-1" },
            static: { "1": "corgo-s-1" },
          }),
          helixTier(1000, { animated: { "1": "corgo-a-1000" } }),
          helixTier(100, { static: { "2": "corgo-s-100" } }),
          helixTier(10000, null),
        ],
      },
      { prefix: "  ", tiers: [helixTier(1, { animated: { "1": "x" } })] },
      { prefix: "Empty", tiers: [helixTier(1, null)] },
    ])

    const catalog = await fetchCheermotes("token", "client", " 1001 ")

    expect(catalog.sets.map((set) => set.prefix)).toEqual(["Corgo"])
    expect(catalog.sets[0].tiers.map((tier) => tier.minBits)).toEqual([
      1000, 100, 1,
    ])
    expect(catalog.match("corgo50")?.tier.id).toBe("1")
    expect(catalog.match("Corgo999")?.tier.id).toBe("100")
    expect(catalog.match("Corgo20000")?.tier.id).toBe("1000")
    expect(catalog.match("Cheer100")).toBeNull()

    const thousand = catalog.sets[0].tiers[0]
    expect(thousand.staticUrl).toBe("corgo-a-1000")
    const hundred = catalog.sets[0].tiers[1]
    expect(hundred.animatedUrl).toBe("")
    expect(hundred.staticUrl).toBe("corgo-s-100")

    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe(
      "https://api.twitch.tv/helix/bits/cheermotes?broadcaster_id=1001"
    )
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token")
    expect(new Headers(init?.headers).get("Client-Id")).toBe("client")
  })

  test("prefers a longer prefix when both could match", async () => {
    respondWith([
      {
        prefix: "Party",
        tiers: [helixTier(1, { animated: { "1": "short" } })],
      },
      {
        prefix: "Party1",
        tiers: [helixTier(1, { animated: { "1": "long" } })],
      },
    ])

    const catalog = await fetchCheermotes("token", "client")

    expect(catalog.match("Party1100")).toMatchObject({
      prefix: "Party1",
      amount: 100,
    })
  })

  test("caches catalogs per broadcaster", async () => {
    respondWith([
      { prefix: "Cheer", tiers: [helixTier(1, { animated: { "1": "a" } })] },
    ])

    const first = await fetchCheermotes("token", "client", "1")
    const second = await fetchCheermotes("token", "client", "1")
    await fetchCheermotes("token", "client", "2")

    expect(second).toBe(first)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    clearCheermoteCache("1")
    await fetchCheermotes("token", "client", "1")
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  test("shares a single request between concurrent callers", async () => {
    respondWith([])

    const [first, second] = await Promise.all([
      fetchCheermotes("token", "client"),
      fetchCheermotes("token", "client"),
    ])

    expect(first).toBe(second)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  test("falls back to the default catalog when Helix returns no usable sets", async () => {
    respondWith([])

    expect(await fetchCheermotes("token", "client")).toBe(
      DEFAULT_CHEERMOTE_CATALOG
    )
    const [url] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe("https://api.twitch.tv/helix/bits/cheermotes")
  })

  test("throws a TwitchApiError on HTTP failure", async () => {
    respondWith(null, 401)

    const error = await fetchCheermotes("token", "client").catch(
      (caught: unknown) => caught
    )

    expect(error).toBeInstanceOf(TwitchApiError)
    expect((error as TwitchApiError).status).toBe(401)
  })

  test("does not cache failed requests", async () => {
    respondWith(null, 500)

    const [first, second] = await Promise.allSettled([
      fetchCheermotes("token", "client", "1"),
      fetchCheermotes("token", "client", "1"),
    ])
    expect(first.status).toBe("rejected")
    expect(second.status).toBe("rejected")
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    respondWith([
      { prefix: "Corgo", tiers: [helixTier(1, { animated: { "1": "a" } })] },
    ])

    const catalog = await fetchCheermotes("token", "client", "1")
    expect(catalog.sets.map((set) => set.prefix)).toEqual(["Corgo"])
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(await fetchCheermotes("token", "client", "1")).toBe(catalog)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  test("a stale failure does not evict a newer request", async () => {
    let rejectFirst!: (error: Error) => void
    fetchSpy.mockImplementationOnce(
      (() =>
        new Promise<Response>((_, reject) => {
          rejectFirst = reject
        })) as unknown as typeof fetch
    )

    const stale = fetchCheermotes("token", "client", "1").catch(
      (caught: unknown) => caught
    )
    clearCheermoteCache("1")

    respondWith([
      { prefix: "Corgo", tiers: [helixTier(1, { animated: { "1": "a" } })] },
    ])
    const fresh = fetchCheermotes("token", "client", "1")

    rejectFirst(new Error("network"))
    expect(await stale).toBeInstanceOf(Error)

    const [again, catalog] = await Promise.all([
      fetchCheermotes("token", "client", "1"),
      fresh,
    ])
    expect(again).toBe(catalog)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  test("a request cleared while in flight does not repopulate the cache", async () => {
    let resolveFirst!: (response: Response) => void
    fetchSpy.mockImplementationOnce(
      (() =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve
        })) as unknown as typeof fetch
    )

    const stale = fetchCheermotes("token", "client", "1")
    clearCheermoteCache("1")
    resolveFirst(
      new Response(
        JSON.stringify({
          data: [
            {
              prefix: "Stale",
              tiers: [helixTier(1, { animated: { "1": "a" } })],
            },
          ],
        })
      )
    )
    expect((await stale).sets.map((set) => set.prefix)).toEqual(["Stale"])

    respondWith([
      { prefix: "Fresh", tiers: [helixTier(1, { animated: { "1": "a" } })] },
    ])
    const fresh = await fetchCheermotes("token", "client", "1")
    expect(fresh.sets.map((set) => set.prefix)).toEqual(["Fresh"])
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
