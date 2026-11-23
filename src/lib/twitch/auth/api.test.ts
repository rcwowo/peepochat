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
  TwitchApiError,
  createTwitchStreamMarker,
  deleteTwitchChatMessage,
  fetchSharedChatSession,
  fetchTwitchFollowedChannels,
  fetchTwitchModeratorStatus,
  fetchTwitchUser,
  fetchTwitchUsersById,
  fetchUserChatEmotes,
  revokeTwitchToken,
  validateTwitchToken,
  type TwitchFollowedChannel,
} from "@/lib/twitch/auth/api"

const TOKEN = "access-token"
const CLIENT = "client-id"

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
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

type FetchMock = ReturnType<typeof mockFetch>

function call(fetchMock: FetchMock, index = 0) {
  const [input, init] = fetchMock.mock.calls[index] ?? []
  return { url: new URL(String(input)), init }
}

async function caught(promise: Promise<unknown>): Promise<TwitchApiError> {
  const error = await promise.then(
    () => {
      throw new Error("expected rejection")
    },
    (reason: unknown) => reason
  )
  expect(error).toBeInstanceOf(TwitchApiError)
  return error as TwitchApiError
}

afterEach(() => {
  mock.restore()
  setSystemTime()
})

describe("validateTwitchToken", () => {
  test("maps the validation payload", async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        client_id: "cid",
        login: "viewer",
        user_id: "1",
        expires_in: 3600,
        scopes: ["chat:read"],
      })
    )

    expect(await validateTwitchToken(TOKEN)).toEqual({
      clientId: "cid",
      login: "viewer",
      userId: "1",
      expiresIn: 3600,
      scopes: ["chat:read"],
    })
    expect(call(fetchMock).init?.headers).toEqual({
      Authorization: `OAuth ${TOKEN}`,
    })
  })

  test("defaults missing scopes to an empty list", async () => {
    mockFetch(
      jsonResponse({ client_id: "c", login: "l", user_id: "1", expires_in: 1 })
    )
    expect((await validateTwitchToken(TOKEN)).scopes).toEqual([])
  })

  test("rejects an invalid or expired token with status 401", async () => {
    mockFetch(
      jsonResponse({ status: 401, message: "invalid access token" }, 401)
    )
    const error = await caught(validateTwitchToken(TOKEN))
    expect(error.status).toBe(401)
  })
})

describe("revokeTwitchToken", () => {
  test("posts the token as a form body", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 200 }))

    expect(await revokeTwitchToken(TOKEN, CLIENT)).toBe(true)
    const { url, init } = call(fetchMock)
    expect(url.href).toBe("https://id.twitch.tv/oauth2/revoke")
    expect(init?.method).toBe("POST")
    expect(String(init?.body)).toBe(`client_id=${CLIENT}&token=${TOKEN}`)
  })

  test("reports failure instead of throwing", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 400 }))
    expect(await revokeTwitchToken(TOKEN, CLIENT)).toBe(false)

    fetchMock.mockRejectedValueOnce(new TypeError("offline"))
    expect(await revokeTwitchToken(TOKEN, CLIENT)).toBe(false)
  })
})

describe("fetchTwitchUser", () => {
  test("sends Helix auth headers and maps the user with defaults", async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        data: [{ id: "1", login: "viewer", display_name: "Viewer" }],
      })
    )

    expect(await fetchTwitchUser(TOKEN, CLIENT)).toEqual({
      id: "1",
      login: "viewer",
      displayName: "Viewer",
      profileImageUrl: "",
      bannerImageUrl: "",
      description: "",
      createdAt: "",
      broadcasterType: "",
      type: "",
    })
    expect(call(fetchMock).init?.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      "Client-Id": CLIENT,
    })
  })

  test("throws 404 when the response has no user", async () => {
    mockFetch(jsonResponse({ data: [] }))
    expect((await caught(fetchTwitchUser(TOKEN, CLIENT))).status).toBe(404)

    mockFetch(jsonResponse({}))
    expect((await caught(fetchTwitchUser(TOKEN, CLIENT))).status).toBe(404)
  })

  test("propagates the HTTP status on failure", async () => {
    mockFetch(jsonResponse({ message: "Unauthorized" }, 401))
    expect((await caught(fetchTwitchUser(TOKEN, CLIENT))).status).toBe(401)
  })

  test("rejects on a malformed JSON body", async () => {
    mockFetch(new Response("not json", { status: 200 }))
    await expect(fetchTwitchUser(TOKEN, CLIENT)).rejects.toThrow()
  })
})

describe("fetchTwitchUsersById", () => {
  test("dedupes ids and splits requests into chunks of 100", async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `${index}`)
    const respondWithRequestedUsers = async (input: RequestInfo | URL) => {
      const requested = new URL(String(input)).searchParams.getAll("id")
      return jsonResponse({
        data: requested.map((id) => ({
          id,
          login: `u${id}`,
          display_name: `U${id}`,
        })),
      })
    }
    const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
      respondWithRequestedUsers as typeof fetch
    )

    const users = await fetchTwitchUsersById(
      [...ids, " 0 ", "", "  "],
      TOKEN,
      CLIENT
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(call(fetchMock, 0).url.searchParams.getAll("id")).toHaveLength(100)
    expect(call(fetchMock, 1).url.searchParams.getAll("id")).toHaveLength(50)
    expect(users.map((user) => user.id)).toEqual(ids)
  })

  test("skips the request entirely for empty input", async () => {
    const fetchMock = mockFetch()
    expect(await fetchTwitchUsersById([" ", ""], TOKEN, CLIENT)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("fails if any chunk fails", async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `${index}`)
    mockFetch(jsonResponse({ data: [] }), jsonResponse({}, 503))
    expect(
      (await caught(fetchTwitchUsersById(ids, TOKEN, CLIENT))).status
    ).toBe(503)
  })
})

describe("paginated endpoints", () => {
  test("fetchTwitchFollowedChannels follows cursors and reports progress", async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        data: [
          {
            broadcaster_id: "1",
            broadcaster_login: "Alpha",
            broadcaster_name: "Alpha",
            followed_at: "2024-01-01T00:00:00Z",
          },
        ],
        pagination: { cursor: "next-page" },
      }),
      jsonResponse({
        data: [
          {
            broadcaster_id: "2",
            broadcaster_login: "beta",
            broadcaster_name: "Beta",
            followed_at: "2024-02-01T00:00:00Z",
          },
        ],
        pagination: {},
      })
    )
    const pages: number[] = []

    const channels = await fetchTwitchFollowedChannels({
      userId: "me",
      accessToken: TOKEN,
      clientId: CLIENT,
      onPage: (current: TwitchFollowedChannel[]) => pages.push(current.length),
    })

    expect(channels).toEqual([
      {
        id: "1",
        login: "alpha",
        displayName: "Alpha",
        followedAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "2",
        login: "beta",
        displayName: "Beta",
        followedAt: "2024-02-01T00:00:00Z",
      },
    ])
    expect(pages).toEqual([1, 2])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(call(fetchMock, 0).url.searchParams.get("after")).toBeNull()
    expect(call(fetchMock, 1).url.searchParams.get("after")).toBe("next-page")
    expect(call(fetchMock, 1).url.searchParams.get("user_id")).toBe("me")
  })

  test("fetchTwitchFollowedChannels stops on an error mid-pagination", async () => {
    mockFetch(
      jsonResponse({ data: [], pagination: { cursor: "c" } }),
      jsonResponse({}, 500)
    )
    const error = await caught(
      fetchTwitchFollowedChannels({
        userId: "me",
        accessToken: TOKEN,
        clientId: CLIENT,
      })
    )
    expect(error.status).toBe(500)
  })

  test("fetchUserChatEmotes paginates and resolves image URLs", async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        data: [
          {
            id: "e1",
            name: "Kappa",
            images: {
              url_1x: "https://cdn/e1/static/1.0",
              url_2x: "",
              url_4x: "",
            },
            format: ["static", "animated"],
            emote_type: "subscriptions",
            owner_id: "99",
            tier: "1000",
          },
        ],
        template:
          "https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}",
        pagination: { cursor: "more" },
      }),
      jsonResponse({
        data: [{ id: "e2", name: "PogChamp" }],
        template:
          "https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}",
      })
    )

    const emotes = await fetchUserChatEmotes("me", TOKEN, CLIENT, "chan")

    expect(emotes).toEqual([
      {
        id: "e1",
        name: "Kappa",
        imageUrl: "https://cdn/e1/animated/1.0",
        formats: ["static", "animated"],
        tier: "1000",
        emoteType: "subscriptions",
        ownerId: "99",
      },
      {
        id: "e2",
        name: "PogChamp",
        imageUrl:
          "https://static-cdn.jtvnw.net/emoticons/v2/e2/static/dark/1.0",
        formats: ["static"],
        tier: undefined,
        emoteType: undefined,
        ownerId: undefined,
      },
    ])
    expect(call(fetchMock, 0).url.searchParams.get("broadcaster_id")).toBe(
      "chan"
    )
    expect(call(fetchMock, 1).url.searchParams.get("after")).toBe("more")
  })
})

describe("simple lookups", () => {
  test("fetchTwitchModeratorStatus returns null when the user is not a moderator", async () => {
    mockFetch(jsonResponse({ data: [] }))
    expect(
      await fetchTwitchModeratorStatus({
        broadcasterId: "b",
        userId: "u",
        accessToken: TOKEN,
        clientId: CLIENT,
      })
    ).toBeNull()
  })

  test("fetchSharedChatSession parses participants and drops blank ids", async () => {
    mockFetch(
      jsonResponse({
        data: [
          {
            session_id: " s1 ",
            host_broadcaster_id: "",
            participants: [
              { broadcaster_id: "a" },
              { broadcaster_id: " " },
              {},
            ],
            created_at: "c",
          },
        ],
      })
    )

    expect(await fetchSharedChatSession(" b1 ", TOKEN, CLIENT)).toEqual({
      sessionId: "s1",
      hostBroadcasterId: "b1",
      participants: [{ broadcasterId: "a" }],
      createdAt: "c",
      updatedAt: "",
    })
  })

  test("fetchSharedChatSession returns null without a session", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [{ session_id: "  " }] }))
    expect(await fetchSharedChatSession("b1", TOKEN, CLIENT)).toBeNull()
    expect(await fetchSharedChatSession("  ", TOKEN, CLIENT)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("moderation error handling", () => {
  const deleteMessage = () =>
    deleteTwitchChatMessage({
      broadcasterId: "b",
      moderatorId: "m",
      messageId: "msg",
      accessToken: TOKEN,
      clientId: CLIENT,
    })

  test("sends a DELETE with the expected query", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }))
    await deleteMessage()

    const { url, init } = call(fetchMock)
    expect(init?.method).toBe("DELETE")
    expect(url.pathname).toBe("/helix/moderation/chat")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      broadcaster_id: "b",
      moderator_id: "m",
      message_id: "msg",
    })
  })

  test("uses the API error message and Retry-After seconds", async () => {
    mockFetch(
      jsonResponse({ message: "  Too many requests  " }, 429, {
        "Retry-After": "3",
      })
    )
    const error = await caught(deleteMessage())

    expect(error.message).toBe("Too many requests")
    expect(error.status).toBe(429)
    expect(error.retryAfterMs).toBe(3000)
  })

  test("parses an HTTP-date Retry-After relative to now", async () => {
    setSystemTime(new Date("2026-01-01T00:00:00Z"))
    mockFetch(
      jsonResponse({}, 429, { "Retry-After": "Thu, 01 Jan 2026 00:00:10 GMT" })
    )
    expect((await caught(deleteMessage())).retryAfterMs).toBe(10_000)
  })

  test("falls back to the default message for a non-JSON error body", async () => {
    mockFetch(new Response("<html>bad gateway</html>", { status: 502 }))
    const error = await caught(deleteMessage())

    expect(error.message).toBe("Could not delete message.")
    expect(error.status).toBe(502)
    expect(error.retryAfterMs).toBeNull()
  })

  test("createTwitchStreamMarker rejects an empty success response", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }))
    const error = await caught(
      createTwitchStreamMarker({
        userId: "u",
        description: `  ${"x".repeat(200)}  `,
        accessToken: TOKEN,
        clientId: CLIENT,
      })
    )

    expect(error.status).toBe(500)
    expect(JSON.parse(String(call(fetchMock).init?.body))).toEqual({
      user_id: "u",
      description: "x".repeat(140),
    })
  })
})
