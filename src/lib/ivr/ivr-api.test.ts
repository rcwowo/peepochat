import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"

import {
  IvrApiError,
  fetchIvrTwitchModVip,
  fetchIvrTwitchSubage,
  fetchIvrTwitchUserProfile,
} from "@/lib/ivr/ivr-api"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function mockFetch(...responses: Response[]) {
  const fetchMock = spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected fetch")
  )
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response)
  }
  return fetchMock
}

function requestedUrl(fetchMock: ReturnType<typeof mockFetch>, call = 0) {
  return String(fetchMock.mock.calls[call]?.[0])
}

afterEach(() => {
  mock.restore()
})

describe("fetchIvrTwitchSubage", () => {
  test("normalizes logins into the request path and returns the payload", async () => {
    const payload = { statusHidden: false, streak: null, cumulative: null }
    const fetchMock = mockFetch(jsonResponse(payload))

    const result = await fetchIvrTwitchSubage({
      userLogin: " @SomeUser ",
      channelLogin: "#Streamer",
    })

    expect(requestedUrl(fetchMock)).toBe(
      "https://api.ivr.fi/v2/twitch/subage/someuser/streamer"
    )
    expect(result as unknown).toEqual(payload)
  })

  test("returns null without a request for empty logins", async () => {
    const fetchMock = mockFetch()
    expect(
      await fetchIvrTwitchSubage({ userLogin: " @ ", channelLogin: "x" })
    ).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("returns null on 404", async () => {
    mockFetch(new Response("", { status: 404 }))
    expect(
      await fetchIvrTwitchSubage({ userLogin: "a", channelLogin: "b" })
    ).toBeNull()
  })

  test("throws IvrApiError with the status on other failures", async () => {
    mockFetch(new Response("", { status: 502 }))
    const error = await fetchIvrTwitchSubage({
      userLogin: "a",
      channelLogin: "b",
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(IvrApiError)
    expect((error as IvrApiError).status).toBe(502)
  })
})

describe("fetchIvrTwitchUserProfile", () => {
  test("reads the first entry of an array payload with snake_case fallbacks", async () => {
    const fetchMock = mockFetch(
      jsonResponse([
        {
          id: "42",
          login: "someone",
          display_name: "SomeOne",
          profile_banner_url: "https://example.com/banner.png",
        },
        { id: "43" },
      ])
    )

    const profile = await fetchIvrTwitchUserProfile({ userLogin: "@SomeOne" })

    expect(requestedUrl(fetchMock)).toBe(
      "https://api.ivr.fi/v2/twitch/user?login=someone"
    )
    expect(profile).toEqual({
      id: "42",
      login: "someone",
      displayName: "SomeOne",
      bannerImageUrl: "https://example.com/banner.png",
    })
  })

  test("falls back to the requested login when fields are missing or mistyped", async () => {
    mockFetch(jsonResponse({ id: 42, displayName: null, banner: 5 }))

    expect(await fetchIvrTwitchUserProfile({ userLogin: "target" })).toEqual({
      id: "",
      login: "target",
      displayName: "target",
      bannerImageUrl: "",
    })
  })

  test.each([[[]], [null], ["text"]])(
    "returns null for an unusable payload %p",
    async (payload) => {
      mockFetch(jsonResponse(payload))
      expect(await fetchIvrTwitchUserProfile({ userLogin: "x" })).toBeNull()
    }
  )

  test("returns null on 404 and throws on server errors", async () => {
    mockFetch(
      new Response("", { status: 404 }),
      new Response("", { status: 500 })
    )

    expect(await fetchIvrTwitchUserProfile({ userLogin: "x" })).toBeNull()
    await expect(fetchIvrTwitchUserProfile({ userLogin: "x" })).rejects.toThrow(
      IvrApiError
    )
  })

  test("rejects when the response body is not JSON", async () => {
    mockFetch(new Response("<html>oops</html>", { status: 200 }))
    await expect(
      fetchIvrTwitchUserProfile({ userLogin: "x" })
    ).rejects.toThrow()
  })
})

describe("fetchIvrTwitchModVip", () => {
  test("parses mods and VIPs, skipping entries without a login", async () => {
    mockFetch(
      jsonResponse({
        mods: [
          {
            id: "1",
            login: "mod_one",
            displayName: "Mod_One",
            grantedAt: "2024-01-01",
          },
          {
            id: "2",
            login: "mod_two",
            display_name: "ModTwo",
            granted_at: "2024-02-02",
          },
          { id: "3", displayName: "NoLogin" },
          null,
          "junk",
        ],
        vips: [{ login: "vip_one" }],
        ttl: 120,
      })
    )

    expect(await fetchIvrTwitchModVip("#Channel")).toEqual({
      mods: [
        {
          id: "1",
          login: "mod_one",
          displayName: "Mod_One",
          grantedAt: "2024-01-01",
        },
        {
          id: "2",
          login: "mod_two",
          displayName: "ModTwo",
          grantedAt: "2024-02-02",
        },
      ],
      vips: [
        { id: "", login: "vip_one", displayName: "vip_one", grantedAt: "" },
      ],
      ttl: 120,
    })
  })

  test("treats missing lists and a non-numeric ttl as empty", async () => {
    mockFetch(jsonResponse({ mods: "nope", ttl: "60" }))
    expect(await fetchIvrTwitchModVip("channel")).toEqual({
      mods: [],
      vips: [],
      ttl: null,
    })
  })

  test("returns empty lists on 404", async () => {
    const fetchMock = mockFetch(new Response("", { status: 404 }))
    expect(await fetchIvrTwitchModVip("Channel")).toEqual({
      mods: [],
      vips: [],
      ttl: null,
    })
    expect(requestedUrl(fetchMock)).toBe(
      "https://api.ivr.fi/v2/twitch/modvip/channel"
    )
  })

  test("requires a channel login", async () => {
    const fetchMock = mockFetch()
    const error = await fetchIvrTwitchModVip("  ").catch(
      (caught: unknown) => caught
    )

    expect(error).toBeInstanceOf(IvrApiError)
    expect((error as IvrApiError).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("throws with the response status on failure", async () => {
    mockFetch(new Response("", { status: 429 }))
    const error = await fetchIvrTwitchModVip("x").catch(
      (caught: unknown) => caught
    )
    expect((error as IvrApiError).status).toBe(429)
  })
})
