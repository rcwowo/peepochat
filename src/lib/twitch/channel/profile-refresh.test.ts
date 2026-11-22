import { describe, expect, test } from "bun:test"

import {
  createDefaultConfig,
  createTwitchChannel,
  type AppConfig,
  type TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import { TwitchApiError, type TwitchUser } from "@/lib/twitch/auth/api"
import {
  applyAccountBanner,
  applyProfileRefresh,
  chunkLogins,
  fetchAccountBannerImageUrl,
  fetchProfileRefresh,
  isRetryableProfileError,
  type ProfileRefreshFetchers,
} from "@/lib/twitch/channel/profile-refresh"

const account: TwitchAccount = {
  id: "1",
  login: "viewer",
  displayName: "Viewer",
  profileImageUrl: "https://example.com/old-viewer.png",
  bannerImageUrl: "https://example.com/old-banner.png",
  accessToken: "token",
  clientId: "client",
  scopes: [],
}

function user(overrides: Partial<TwitchUser>): TwitchUser {
  return {
    id: "0",
    login: "",
    displayName: "",
    profileImageUrl: "",
    bannerImageUrl: "",
    description: "",
    createdAt: "",
    broadcasterType: "",
    type: "",
    ...overrides,
  }
}

function makeConfig(): AppConfig {
  const config = createDefaultConfig()
  return {
    ...config,
    twitch: {
      ...config.twitch,
      account,
      channels: [
        createTwitchChannel("forsen", {
          displayName: "forsen",
          profileImageUrl: "https://example.com/old-forsen.png",
        }),
        createTwitchChannel("xqc", {
          displayName: "xQc",
          profileImageUrl: "https://example.com/xqc.png",
        }),
        createTwitchChannel("bare"),
      ],
    },
  }
}

describe("chunkLogins", () => {
  test("normalizes, dedupes and splits logins into batches", () => {
    expect(
      chunkLogins(["#Forsen", "forsen", " xQc ", "", "a", "b"], 2)
    ).toEqual([
      ["forsen", "xqc"],
      ["a", "b"],
    ])
  })

  test("returns no batches for empty input", () => {
    expect(chunkLogins([])).toEqual([])
  })
})

describe("applyProfileRefresh", () => {
  test("returns the same config when nothing changed", () => {
    const config = makeConfig()
    const next = applyProfileRefresh(config, {
      account: user({
        id: "1",
        login: "viewer",
        displayName: "Viewer",
        profileImageUrl: account.profileImageUrl,
      }),
      channels: [
        user({
          login: "xqc",
          displayName: "xQc",
          profileImageUrl: "https://example.com/xqc.png",
        }),
      ],
    })
    expect(next).toBe(config)
  })

  test("updates changed channel profiles and preserves other fields", () => {
    const config = makeConfig()
    config.twitch.channels[0] = {
      ...config.twitch.channels[0]!,
      liveNotificationsEnabled: true,
    }
    const next = applyProfileRefresh(config, {
      account: null,
      channels: [
        user({
          login: "forsen",
          displayName: "Forsen",
          profileImageUrl: "https://example.com/new-forsen.png",
        }),
        user({
          login: "bare",
          displayName: "Bare",
          profileImageUrl: "https://example.com/bare.png",
        }),
      ],
    })

    expect(next.twitch.account).toBe(config.twitch.account)
    expect(next.twitch.channels[0]).toEqual({
      ...config.twitch.channels[0]!,
      displayName: "Forsen",
      profileImageUrl: "https://example.com/new-forsen.png",
    })
    expect(next.twitch.channels[1]).toBe(config.twitch.channels[1]!)
    expect(next.twitch.channels[2]?.profileImageUrl).toBe(
      "https://example.com/bare.png"
    )
  })

  test("updates the signed-in account profile", () => {
    const config = makeConfig()
    const next = applyProfileRefresh(config, {
      account: user({
        id: "1",
        login: "viewer",
        displayName: "VIEWER",
        profileImageUrl: "https://example.com/new-viewer.png",
      }),
      channels: [],
    })

    expect(next.twitch.account).toEqual({
      ...account,
      displayName: "VIEWER",
      profileImageUrl: "https://example.com/new-viewer.png",
    })
    expect(next.twitch.channels).toBe(config.twitch.channels)
  })

  test("ignores account data for a different user", () => {
    const config = makeConfig()
    const next = applyProfileRefresh(config, {
      account: user({
        id: "2",
        login: "someone",
        displayName: "Someone",
        profileImageUrl: "https://example.com/someone.png",
      }),
      channels: [],
    })

    expect(next).toBe(config)
  })
})

describe("applyAccountBanner", () => {
  test("updates the banner for the matching account", () => {
    const next = applyAccountBanner(
      makeConfig(),
      "1",
      "https://example.com/new-banner.png"
    )
    expect(next.twitch.account?.bannerImageUrl).toBe(
      "https://example.com/new-banner.png"
    )
  })

  test("keeps the config when the banner is unknown, unchanged or for another account", () => {
    const config = makeConfig()
    expect(applyAccountBanner(config, "1", null)).toBe(config)
    expect(applyAccountBanner(config, "1", account.bannerImageUrl)).toBe(config)
    expect(
      applyAccountBanner(config, "2", "https://example.com/other.png")
    ).toBe(config)
  })
})

describe("isRetryableProfileError", () => {
  test("retries network, rate limit and server errors only", () => {
    expect(isRetryableProfileError(new TypeError("Failed to fetch"))).toBe(true)
    expect(isRetryableProfileError(new TwitchApiError("x", 429))).toBe(true)
    expect(isRetryableProfileError(new TwitchApiError("x", 503))).toBe(true)
    expect(isRetryableProfileError(new TwitchApiError("x", 400))).toBe(false)
    expect(isRetryableProfileError(new TwitchApiError("x", 401))).toBe(false)
  })
})

describe("fetchProfileRefresh", () => {
  const auth = { accessToken: "token", clientId: "client" }
  const logins = Array.from({ length: 250 }, (_, index) => `user${index}`)

  function fetchers(
    failures: Map<number, unknown>,
    accountError?: unknown
  ): ProfileRefreshFetchers & { batches: string[][] } {
    const batches: string[][] = []
    return {
      batches,
      fetchUser: async () => {
        if (accountError) throw accountError
        return user({ id: "1", login: "viewer" })
      },
      fetchUsersByLogin: async (chunk) => {
        const index = batches.length
        batches.push(chunk)
        const failure = failures.get(index)
        if (failure) throw failure
        return chunk.map((login) => user({ login }))
      },
    }
  }

  test("only marks logins from batches with retryable failures for retry", async () => {
    const mock = fetchers(
      new Map<number, unknown>([
        [1, new TwitchApiError("x", 400)],
        [2, new TwitchApiError("x", 503)],
      ])
    )
    const outcome = await fetchProfileRefresh(
      auth,
      { includeAccount: true, channelLogins: logins },
      mock
    )

    expect(mock.batches.map((batch) => batch.length)).toEqual([100, 100, 50])
    expect(outcome.refresh.account?.id).toBe("1")
    expect(outcome.refresh.channels).toHaveLength(100)
    expect(outcome.retryAccount).toBe(false)
    expect(outcome.retryLogins).toEqual(logins.slice(200))
    expect(outcome.unauthorized).toBe(false)
  })

  test("reports unauthorized without scheduling retries", async () => {
    const mock = fetchers(
      new Map([[0, new TwitchApiError("x", 401)]]),
      new TwitchApiError("x", 401)
    )
    const outcome = await fetchProfileRefresh(
      auth,
      { includeAccount: true, channelLogins: ["forsen"] },
      mock
    )

    expect(outcome.unauthorized).toBe(true)
    expect(outcome.retryAccount).toBe(false)
    expect(outcome.retryLogins).toEqual([])
  })

  test("skips the account lookup when it is not requested", async () => {
    const mock = fetchers(new Map(), new TypeError("should not be called"))
    const outcome = await fetchProfileRefresh(
      auth,
      { includeAccount: false, channelLogins: ["forsen"] },
      mock
    )

    expect(outcome.refresh.account).toBeNull()
    expect(outcome.retryAccount).toBe(false)
    expect(outcome.refresh.channels).toHaveLength(1)
  })
})

describe("fetchAccountBannerImageUrl", () => {
  test("returns the banner from the profile", async () => {
    const banner = await fetchAccountBannerImageUrl(
      "viewer",
      1000,
      async () => ({
        id: "1",
        login: "viewer",
        displayName: "Viewer",
        bannerImageUrl: "https://example.com/banner.png",
      })
    )
    expect(banner).toBe("https://example.com/banner.png")
  })

  test("returns null when the lookup fails", async () => {
    const banner = await fetchAccountBannerImageUrl(
      "viewer",
      1000,
      async () => {
        throw new Error("down")
      }
    )
    expect(banner).toBeNull()
  })

  test("returns null when the lookup never settles", async () => {
    const banner = await fetchAccountBannerImageUrl(
      "viewer",
      5,
      () => new Promise(() => {})
    )
    expect(banner).toBeNull()
  })
})
