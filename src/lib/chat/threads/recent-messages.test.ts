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
  createRecentMessagesStatusMessage,
  fetchRecentMessages,
  parseRecentChatMessages,
} from "@/lib/chat/threads/recent-messages"

function privmsg(id: string, text: string, extraTags: string[] = []): string {
  const tags = [
    "badge-info=",
    "badges=moderator/1",
    "color=#FF0000",
    "display-name=Alice",
    "emotes=",
    `id=${id}`,
    "mod=1",
    "room-id=1",
    "tmi-sent-ts=1700000000000",
    "user-id=42",
    ...extraTags,
  ]
  return `@${tags.join(";")} :alice!alice@alice.tmi.twitch.tv PRIVMSG #room :${text}`
}

afterEach(() => {
  mock.restore()
  setSystemTime()
})

describe("parseRecentChatMessages", () => {
  test("parses PRIVMSG lines and skips other commands", () => {
    const messages = parseRecentChatMessages([
      "@room-id=1;slow=0 :tmi.twitch.tv ROOMSTATE #room",
      privmsg("a", "hello"),
      "@ban-duration=10;room-id=1;target-user-id=7 :tmi.twitch.tv CLEARCHAT #room :spammer",
      privmsg("b", "world"),
      ":tmi.twitch.tv PRIVMSG #room :untagged",
    ])

    expect(messages.map((message) => [message.id, message.text])).toEqual([
      ["a", "hello"],
      ["b", "world"],
    ])
    expect(messages[0]).toMatchObject({
      channel: "room",
      userName: "alice",
      displayName: "Alice",
      userId: "42",
      deletedAt: null,
    })
  })

  test("prefers the recent-messages receive timestamp", () => {
    const [message] = parseRecentChatMessages([
      privmsg("a", "hi", ["rm-received-ts=1700000005000"]),
    ])
    expect(message!.receivedAt).toBe(new Date(1700000005000).toISOString())
  })

  test("marks lines flagged as deleted in the tag section", () => {
    const [deleted, kept] = parseRecentChatMessages([
      privmsg("a", "bad", ["rm-deleted=1"]),
      privmsg("b", "rm-deleted=1 is just text"),
    ])
    expect(deleted!.deletedAt).toBe(deleted!.receivedAt)
    expect(kept!.deletedAt).toBeNull()
  })

  test("does not treat similarly named tags as deleted", () => {
    const [message] = parseRecentChatMessages([
      privmsg("a", "hi", ["rm-deleted=10", "xrm-deleted=1"]),
    ])
    expect(message!.deletedAt).toBeNull()
  })
})

describe("createRecentMessagesStatusMessage", () => {
  test("builds a normalized status message stamped with the current time", () => {
    setSystemTime(new Date("2024-05-01T12:00:00.000Z"))
    const message = createRecentMessagesStatusMessage("#SomeRoom ", "Nope")
    expect(message).toMatchObject({
      id: `someroom:recent-messages:${Date.parse("2024-05-01T12:00:00.000Z")}`,
      channel: "someroom",
      text: "Nope",
      headline: "Nope",
      event: "status",
      level: "info",
      receivedAt: "2024-05-01T12:00:00.000Z",
      msgId: null,
    })
  })
})

describe("fetchRecentMessages", () => {
  function mockFetch(response: Response | Error) {
    return spyOn(globalThis, "fetch").mockImplementation((() =>
      response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response)) as unknown as typeof fetch)
  }

  test("skips the request for an empty channel", async () => {
    const fetchSpy = mockFetch(new Error("should not be called"))
    expect(await fetchRecentMessages("  #  ")).toEqual({
      status: "success",
      messages: [],
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test("requests the normalized channel with the limit and parses messages", async () => {
    const fetchSpy = mockFetch(
      Response.json({ messages: [privmsg("a", "hi")], error: null })
    )
    const outcome = await fetchRecentMessages("#Forsen", 50)

    const url = new URL(String(fetchSpy.mock.calls[0]![0]))
    expect(url.pathname.endsWith("/recent-messages/forsen")).toBe(true)
    expect(url.searchParams.get("limit")).toBe("50")
    expect(url.searchParams.get("hide_moderated_messages")).toBe("false")
    expect(outcome.status).toBe("success")
    if (outcome.status === "success") {
      expect(outcome.messages.map((message) => message.id)).toEqual(["a"])
    }
  })

  test("treats 400, 403 and API errors as unavailable", async () => {
    mockFetch(new Response("", { status: 403 }))
    expect(await fetchRecentMessages("room")).toEqual({ status: "unavailable" })

    mock.restore()
    mockFetch(new Response("", { status: 400 }))
    expect(await fetchRecentMessages("room")).toEqual({ status: "unavailable" })

    mock.restore()
    mockFetch(
      Response.json({ messages: [], error: "channel ignored", error_code: "x" })
    )
    expect(await fetchRecentMessages("room")).toEqual({ status: "unavailable" })
  })

  test("reports other HTTP failures and network errors", async () => {
    mockFetch(new Response("", { status: 502 }))
    expect(await fetchRecentMessages("room")).toEqual({
      status: "error",
      message: "Recent messages request failed (502)",
    })

    mock.restore()
    mockFetch(new Error("offline"))
    expect(await fetchRecentMessages("room")).toEqual({
      status: "error",
      message: "offline",
    })
  })

  test("treats a missing messages array as empty", async () => {
    mockFetch(Response.json({}))
    expect(await fetchRecentMessages("room")).toEqual({
      status: "success",
      messages: [],
    })
  })
})
