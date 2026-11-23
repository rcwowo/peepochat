import { describe, expect, test } from "bun:test"

import {
  collectChatSearchEntries,
  collectRecentSearchUsernames,
  createChatSearchResultsCache,
  findKeywordHighlightRanges,
  getChatSearchSuggestions,
  getChatSearchTokenAtCursor,
  matchChatSearchEntry,
  mergeChatSearchResults,
  mergeHighlightRanges,
  parseChatSearchQuery,
  removeChatSearchFilterRange,
  replaceChatSearchToken,
  resolveChannelSearchLogin,
  resolveSearchChannelLogins,
  searchChatEntries,
  serializeChatSearchQuery,
  splitCommittedSearchQuery,
  updateChatSearchResults,
  type ChatSearchEntry,
  type ChatSearchKnownChannel,
  type ChatSearchResult,
  type ChatSearchSystemMessage,
} from "@/lib/search/chat-search"
import {
  EMPTY_SYSTEM_MESSAGE_META,
  type TwitchChatMessage,
  type TwitchSystemMessage,
} from "@/lib/twitch/chat/chat"
import type { TwitchTimelineItem } from "@/lib/twitch/chat/types"

let nextId = 0

function chatMessage(
  overrides: Partial<Omit<TwitchChatMessage, "flags">> & {
    flags?: Partial<TwitchChatMessage["flags"]>
  } = {}
): TwitchChatMessage {
  nextId += 1
  const { flags, ...rest } = overrides
  return {
    id: `chat-${nextId}`,
    channel: "alpha",
    roomId: null,
    sourceRoomId: null,
    userId: null,
    userName: "viewer",
    displayName: "Viewer",
    text: "hello world",
    color: null,
    receivedAt: "2026-01-01T00:00:00.000Z",
    badges: [],
    badgeInfo: [],
    emotes: [],
    gifs: [],
    reply: null,
    bits: null,
    deletedAt: null,
    ...rest,
    flags: {
      isBroadcaster: false,
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      isFirst: false,
      isAction: false,
      ...flags,
    },
  }
}

function systemMessage(
  overrides: Partial<TwitchSystemMessage> = {}
): ChatSearchSystemMessage {
  nextId += 1
  return {
    id: `system-${nextId}`,
    channel: "alpha",
    roomId: null,
    text: "",
    headline: "",
    details: null,
    receivedAt: "2026-01-01T00:00:00.000Z",
    event: "notice",
    level: "info",
    accentColor: null,
    ...EMPTY_SYSTEM_MESSAGE_META,
    badges: [],
    ...overrides,
  } as ChatSearchSystemMessage
}

function chat(overrides?: Parameters<typeof chatMessage>[0]): ChatSearchEntry {
  return { kind: "chat", message: chatMessage(overrides) }
}

function system(overrides?: Partial<TwitchSystemMessage>): ChatSearchEntry {
  return { kind: "system", message: systemMessage(overrides) }
}

function actor(userName: string, displayName = userName) {
  return { userId: null, userName, displayName, color: null }
}

function matches(entry: ChatSearchEntry, query: string) {
  return matchChatSearchEntry(entry, parseChatSearchQuery(query)) !== null
}

function ids(results: ChatSearchResult[]) {
  return results.map((result) => result.message.id)
}

describe("parseChatSearchQuery", () => {
  test("separates filters from keywords and records filter spans", () => {
    const raw = "hello in:Alpha !from:@Bob world"
    const parsed = parseChatSearchQuery(raw)

    expect(parsed.keywords).toEqual(["hello", "world"])
    expect(parsed.filters).toEqual([
      { key: "in", value: "Alpha", negated: false, start: 6, end: 14 },
      { key: "from", value: "@Bob", negated: true, start: 15, end: 25 },
    ])
    expect(raw.slice(15, 25)).toBe("!from:@Bob")
  })

  test("treats filter keys case-insensitively", () => {
    const parsed = parseChatSearchQuery("FROM:bob Has:link")

    expect(parsed.filters.map((filter) => filter.key)).toEqual(["from", "has"])
    expect(parsed.keywords).toEqual([])
  })

  test("supports quoted phrases and quoted filter values", () => {
    const parsed = parseChatSearchQuery('"good game" from:"some user" gg')

    expect(parsed.keywords).toEqual(["good game", "gg"])
    expect(parsed.filters).toHaveLength(1)
    expect(parsed.filters[0]).toMatchObject({
      key: "from",
      value: "some user",
      start: 12,
      end: 28,
    })
  })

  test("reads an unterminated quote to the end of the query", () => {
    const parsed = parseChatSearchQuery('in:"half open')

    expect(parsed.filters[0]?.value).toBe("half open")
    expect(parsed.keywords).toEqual([])
  })

  test("keeps tokens with unknown keys or leading colons as keywords", () => {
    const parsed = parseChatSearchQuery("https://x.tv :smile: foo:bar ! !x")

    expect(parsed.filters).toEqual([])
    expect(parsed.keywords).toEqual([
      "https://x.tv",
      ":smile:",
      "foo:bar",
      "!",
      "!x",
    ])
  })

  test("keeps colons inside filter values", () => {
    const parsed = parseChatSearchQuery("from:a:b")

    expect(parsed.filters[0]?.value).toBe("a:b")
  })

  test("drops filters with empty values and empty quoted phrases", () => {
    const parsed = parseChatSearchQuery('in: from:"" "   " has:')

    expect(parsed.filters).toEqual([])
    expect(parsed.keywords).toEqual([])
  })

  test("splits on tabs and newlines", () => {
    const parsed = parseChatSearchQuery("a\tb\nin:c")

    expect(parsed.keywords).toEqual(["a", "b"])
    expect(parsed.filters[0]?.value).toBe("c")
  })
})

describe("getChatSearchTokenAtCursor", () => {
  test("returns the whitespace-delimited token around the cursor", () => {
    expect(getChatSearchTokenAtCursor("foo from:bo baz", 10)).toEqual({
      start: 4,
      end: 11,
      text: "from:bo",
    })
  })

  test("treats a quoted value with spaces as a single token", () => {
    const query = 'abc in:"foo bar" x'
    const cursor = query.indexOf("bar") + 1

    expect(getChatSearchTokenAtCursor(query, cursor)).toEqual({
      start: 4,
      end: 16,
      text: 'in:"foo bar"',
    })
  })

  test("clamps cursors outside the query", () => {
    expect(getChatSearchTokenAtCursor("abc", 99).text).toBe("abc")
    expect(getChatSearchTokenAtCursor("abc", -5)).toEqual({
      start: 0,
      end: 3,
      text: "abc",
    })
  })

  test("returns an empty token after trailing whitespace", () => {
    expect(getChatSearchTokenAtCursor("abc ", 4)).toEqual({
      start: 4,
      end: 4,
      text: "",
    })
  })
})

describe("replaceChatSearchToken", () => {
  test("inserts a completed filter with a trailing space", () => {
    const query = "hello fr world"
    const token = getChatSearchTokenAtCursor(query, 8)

    expect(replaceChatSearchToken(query, token, "from:bob")).toEqual({
      query: "hello from:bob world",
      cursor: 15,
    })
  })

  test("does not add a space after a bare filter key", () => {
    const query = "f"
    const token = getChatSearchTokenAtCursor(query, 1)

    expect(replaceChatSearchToken(query, token, "from:")).toEqual({
      query: "from:",
      cursor: 5,
    })
  })
})

describe("removeChatSearchFilterRange", () => {
  test("removes the range and collapses surrounding whitespace", () => {
    const raw = "hello in:alpha world"

    expect(removeChatSearchFilterRange(raw, 6, 14)).toBe("hello world")
    expect(removeChatSearchFilterRange(raw, 0, 5)).toBe("in:alpha world")
  })
})

describe("splitCommittedSearchQuery", () => {
  test("commits filters that are followed by more text", () => {
    expect(splitCommittedSearchQuery("from:bob hello")).toEqual({
      filters: [{ key: "from", value: "bob", negated: false }],
      remainder: "hello",
    })
  })

  test("does not commit a trailing filter that is still being typed", () => {
    expect(splitCommittedSearchQuery("hello from:bo")).toEqual({
      filters: [],
      remainder: "hello from:bo",
    })
  })

  test("commits a trailing filter once a space is typed", () => {
    expect(splitCommittedSearchQuery("hello !in:alpha ")).toEqual({
      filters: [{ key: "in", value: "alpha", negated: true }],
      remainder: "hello",
    })
  })

  test("keeps an incomplete quoted filter in the remainder", () => {
    expect(splitCommittedSearchQuery('from:bob in:"half open')).toEqual({
      filters: [{ key: "from", value: "bob", negated: false }],
      remainder: 'in:"half open',
    })
    expect(splitCommittedSearchQuery('in:"half open ').filters).toEqual([])
  })

  test("commits multiple filters and preserves keyword spacing", () => {
    expect(splitCommittedSearchQuery("a from:x  b role:mod c")).toEqual({
      filters: [
        { key: "from", value: "x", negated: false },
        { key: "role", value: "mod", negated: false },
      ],
      remainder: "a b c",
    })
  })

  test("returns the input untouched when there are no filters", () => {
    expect(splitCommittedSearchQuery("  just words ")).toEqual({
      filters: [],
      remainder: "  just words ",
    })
  })
})

describe("serializeChatSearchQuery", () => {
  test("quotes values with whitespace and prefixes negations", () => {
    expect(
      serializeChatSearchQuery(
        [
          { key: "from", value: "some user", negated: false },
          { key: "in", value: "alpha", negated: true },
        ],
        "  hello"
      )
    ).toBe('from:"some user" !in:alpha hello')
  })

  test("returns the remainder unchanged without filters", () => {
    expect(serializeChatSearchQuery([], "  hello ")).toBe("  hello ")
  })

  test("round-trips through splitCommittedSearchQuery", () => {
    const filters = [
      { key: "from" as const, value: "some user", negated: false },
      { key: "has" as const, value: "link", negated: true },
    ]
    const serialized = serializeChatSearchQuery(filters, "gg wp")

    expect(splitCommittedSearchQuery(serialized)).toEqual({
      filters,
      remainder: "gg wp",
    })
  })
})

describe("channel resolution", () => {
  const channels: ChatSearchKnownChannel[] = [
    { login: "alpha", displayName: "Alpha" },
    { login: "bravo", displayName: "BravoTV" },
    { login: "charlie", displayName: "Charlie" },
  ]

  test("resolves by login or display name, ignoring # and case", () => {
    expect(resolveChannelSearchLogin("#ALPHA", channels)).toBe("alpha")
    expect(resolveChannelSearchLogin("bravotv", channels)).toBe("bravo")
    expect(resolveChannelSearchLogin("unknown", channels)).toBe("")
    expect(resolveChannelSearchLogin("*", channels)).toBe("")
  })

  test("uses default channels when there is no in: filter", () => {
    const parsed = parseChatSearchQuery("hello")

    expect(resolveSearchChannelLogins(parsed, ["#Bravo"], channels)).toEqual([
      "bravo",
    ])
  })

  test("in:* and in:#* select every known channel", () => {
    for (const query of ["in:*", "in:#*"]) {
      expect(
        resolveSearchChannelLogins(parseChatSearchQuery(query), [], channels)
      ).toEqual(["alpha", "bravo", "charlie"])
    }
  })

  test("deduplicates included channels and drops unknown ones", () => {
    const parsed = parseChatSearchQuery(
      "in:alpha in:Alpha in:nobody in:bravotv"
    )

    expect(resolveSearchChannelLogins(parsed, [], channels)).toEqual([
      "alpha",
      "bravo",
    ])
  })

  test("an exclusion alone searches all channels except the excluded one", () => {
    const parsed = parseChatSearchQuery("!in:bravotv")

    expect(resolveSearchChannelLogins(parsed, ["alpha"], channels)).toEqual([
      "alpha",
      "charlie",
    ])
  })

  test("excluding * or the only included channel yields nothing", () => {
    expect(
      resolveSearchChannelLogins(parseChatSearchQuery("!in:*"), [], channels)
    ).toEqual([])
    expect(
      resolveSearchChannelLogins(
        parseChatSearchQuery("in:alpha !in:alpha"),
        [],
        channels
      )
    ).toEqual([])
  })

  test("excludes unknown channel logins from the default channels", () => {
    const parsed = parseChatSearchQuery("in:* !in:#Delta")

    expect(
      resolveSearchChannelLogins(
        parsed,
        [],
        [...channels, { login: "delta", displayName: "" }]
      )
    ).toEqual(["alpha", "bravo", "charlie"])
  })
})

describe("highlight ranges", () => {
  test("merges overlapping and touching ranges in order", () => {
    expect(
      mergeHighlightRanges([
        { start: 10, end: 12 },
        { start: 0, end: 3 },
        { start: 2, end: 5 },
        { start: 5, end: 6 },
      ])
    ).toEqual([
      { start: 0, end: 6 },
      { start: 10, end: 12 },
    ])
  })

  test("does not mutate the input ranges", () => {
    const input = [
      { start: 0, end: 3 },
      { start: 1, end: 5 },
    ]
    mergeHighlightRanges(input)

    expect(input).toEqual([
      { start: 0, end: 3 },
      { start: 1, end: 5 },
    ])
  })

  test("finds every case-insensitive occurrence of every keyword", () => {
    expect(findKeywordHighlightRanges("Kappa kappa KEKW", ["kappa"])).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ])
  })

  test("returns null when any keyword is missing", () => {
    expect(findKeywordHighlightRanges("hello world", ["hello", "x"])).toBeNull()
  })

  test("treats regex metacharacters literally", () => {
    expect(findKeywordHighlightRanges("a.b axb (c)", ["a.b", "(c)"])).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ])
    expect(findKeywordHighlightRanges("axb", ["a.b"])).toBeNull()
  })

  test("uses UTF-16 offsets for astral characters", () => {
    const text = "😀 héllo 😀"
    const ranges = findKeywordHighlightRanges(text, ["HÉLLO", "😀"])

    expect(ranges).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 8 },
      { start: 9, end: 11 },
    ])
  })
})

describe("matchChatSearchEntry", () => {
  test("matches keywords against text, display name, nickname and login", () => {
    const entry = chat({
      userName: "coolguy",
      displayName: "Cool_Guy",
      text: "nothing to see",
    })
    const parsed = parseChatSearchQuery("guy")
    const byDisplay = matchChatSearchEntry(entry, parsed)

    expect(byDisplay).toMatchObject({
      highlightRanges: [],
      usernameHighlightRanges: [{ start: 5, end: 8 }],
    })

    const nicknamed = matchChatSearchEntry(
      entry,
      parseChatSearchQuery("cool"),
      {
        getNicknameByLogin: (login) => (login === "coolguy" ? "Buddy" : null),
      }
    )
    expect(nicknamed).toMatchObject({
      usernameHighlightRanges: [{ start: 0, end: 5 }],
    })

    expect(
      matchChatSearchEntry(entry, parseChatSearchQuery("bud"), {
        getNicknameByLogin: () => "Buddy",
      })
    ).toMatchObject({ usernameHighlightRanges: [{ start: 0, end: 3 }] })
  })

  test("requires every keyword to match somewhere", () => {
    const entry = chat({ userName: "bob", displayName: "Bob", text: "gg wp" })

    expect(matches(entry, "bob gg")).toBe(true)
    expect(matches(entry, "bob ez")).toBe(false)
  })

  test("returns merged text highlight ranges", () => {
    const result = matchChatSearchEntry(
      chat({ text: "abcabc" }),
      parseChatSearchQuery("abc bca")
    )

    expect(result).toMatchObject({ highlightRanges: [{ start: 0, end: 6 }] })
  })

  test("filters by sender with from:, ignoring @ and case", () => {
    const entry = chat({ userName: "bob", displayName: "Bobby" })

    expect(matches(entry, "from:@BOB")).toBe(true)
    expect(matches(entry, "from:bobby")).toBe(true)
    expect(matches(entry, "from:alice from:bob")).toBe(true)
    expect(matches(entry, "from:alice")).toBe(false)
    expect(matches(entry, "!from:bob")).toBe(false)
    expect(matches(entry, "from:@")).toBe(false)
  })

  test("matches from: against system actors and targets", () => {
    const entry = system({
      event: "mod_action",
      modActionKind: "ban",
      actor: actor("mod1"),
      target: actor("baduser", "BadUser"),
    })

    expect(matches(entry, "has:ban from:baduser")).toBe(true)
    expect(matches(entry, "has:ban from:mod1")).toBe(true)
    expect(matches(entry, "has:ban !from:mod1")).toBe(false)
  })

  test("filters by role with aliases, including founder badges on events", () => {
    const mod = chat({ flags: { isModerator: true } })
    const sub = chat({ flags: { isSubscriber: true } })

    expect(matches(mod, "role:mods")).toBe(true)
    expect(matches(mod, "role:vip")).toBe(false)
    expect(matches(mod, "role:vip role:moderator")).toBe(true)
    expect(matches(sub, "!role:sub")).toBe(false)
    expect(matches(sub, "role:nonsense")).toBe(false)
    expect(matches(sub, "!role:nonsense")).toBe(true)

    const founderEvent = system({
      event: "subscription",
      msgId: "resub",
      badges: [{ set: "founder", version: "0" }],
    })
    expect(matches(founderEvent, "has:sub role:subscriber")).toBe(true)
    expect(matches(founderEvent, "has:sub role:streamer")).toBe(false)
  })

  test("excludes system messages unless a type filter selects them", () => {
    const raid = system({ event: "raid", text: "raid incoming" })

    expect(matches(raid, "raid")).toBe(false)
    expect(matches(raid, "has:raid")).toBe(true)
    expect(matches(raid, "has:raids incoming")).toBe(true)
    expect(matches(raid, "has:raid nothing")).toBe(false)
    expect(matches(raid, "!has:chat")).toBe(true)
    expect(matches(chat(), "!has:chat")).toBe(false)
  })

  test("ORs type filters together", () => {
    const raid = system({ event: "raid" })
    const announcement = system({ event: "announcement" })
    const message = chat()

    for (const entry of [raid, announcement, message]) {
      expect(matches(entry, "has:raid has:announcement has:chat")).toBe(true)
    }
    expect(matches(message, "has:raid has:announcement")).toBe(false)
  })

  test("ANDs content filters together", () => {
    const entry = chat({
      text: "@friend look https://example.com",
      emotes: [],
    })

    expect(matches(entry, "has:link has:mention")).toBe(true)
    expect(matches(entry, "has:link has:emote")).toBe(false)
    expect(matches(entry, "has:link !has:mention")).toBe(false)
  })

  test("classifies subscription events by msg-id", () => {
    const gift = system({ event: "subscription", msgId: "SubGift" })
    const upgrade = system({ event: "subscription", msgId: "giftpaidupgrade" })
    const resub = system({ event: "subscription", msgId: "resub" })

    expect(matches(gift, "has:gift")).toBe(true)
    expect(matches(gift, "has:resub")).toBe(false)
    expect(matches(upgrade, "has:upgrade")).toBe(true)
    expect(matches(resub, "has:resub")).toBe(true)
    expect(matches(resub, "has:newsub")).toBe(false)
    expect(matches(resub, "has:sub !has:resub")).toBe(false)
    expect(matches(resub, "has:event")).toBe(true)
  })

  test("distinguishes notices from status events by msg-id", () => {
    const ritual = system({ event: "status", msgId: "ritual" })
    const status = system({ event: "status", msgId: null })

    expect(matches(ritual, "has:event")).toBe(true)
    expect(matches(ritual, "has:notice")).toBe(false)
    expect(matches(status, "has:notice")).toBe(true)
    expect(matches(status, "has:event")).toBe(false)
    expect(matches(system({ event: "connection" }), "has:notice")).toBe(true)
  })

  test("distinguishes bans from timeouts", () => {
    const ban = system({ event: "mod_action", modActionKind: "anonymous_ban" })
    const timeout = system({ event: "mod_action", modActionKind: "timeout" })

    expect(matches(ban, "has:ban")).toBe(true)
    expect(matches(ban, "has:timeout")).toBe(false)
    expect(matches(timeout, "has:timeouts")).toBe(true)
    expect(matches(timeout, "has:moderation")).toBe(true)
  })

  test("matches chat content filters", () => {
    expect(matches(chat({ bits: 100 }), "has:cheer")).toBe(true)
    expect(matches(chat({ bits: 0 }), "has:bits")).toBe(false)
    expect(matches(chat({ flags: { isFirst: true } }), "has:first")).toBe(true)
    expect(
      matches(
        chat({
          reply: {
            parentMessageId: "p",
            threadRootMessageId: "p",
            parentDisplayName: "A",
            parentUserName: "a",
            parentBody: "",
            parentColor: null,
          },
        }),
        "has:reply"
      )
    ).toBe(true)
    expect(matches(chat({ text: "mail me at a@b.com" }), "has:mention")).toBe(
      false
    )
  })

  test("an unknown has: value matches nothing unless negated", () => {
    expect(matches(chat(), "has:unicorn")).toBe(false)
    expect(matches(chat(), "!has:unicorn")).toBe(true)
  })

  test("in: filters do not affect per-entry matching", () => {
    expect(matches(chat({ channel: "alpha" }), "in:bravo")).toBe(true)
  })

  test("matches system keywords against actor and target names and nicknames", () => {
    const entry = system({
      event: "raid",
      text: "is raiding",
      actor: actor("raider", "RaiderTV"),
    })
    const parsed = parseChatSearchQuery("has:raid pal")

    expect(matchChatSearchEntry(entry, parsed)).toBeNull()
    expect(
      matchChatSearchEntry(entry, parsed, {
        getNicknameByLogin: (login) => (login === "raider" ? "Pal" : null),
      })
    ).toEqual({
      kind: "system",
      message: entry.message as ChatSearchSystemMessage,
    })
    expect(matches(entry, "has:raid tv")).toBe(true)
  })
})

describe("searchChatEntries", () => {
  test("returns nothing for an inactive query", () => {
    expect(searchChatEntries([chat()], parseChatSearchQuery("   "))).toEqual([])
  })

  test("sorts results newest first, then by id descending", () => {
    const entries = [
      chat({ id: "a", receivedAt: "2026-01-01T00:00:01.000Z" }),
      chat({ id: "c", receivedAt: "2026-01-01T00:00:03.000Z" }),
      chat({ id: "b1", receivedAt: "2026-01-01T00:00:02.000Z" }),
      chat({ id: "b2", receivedAt: "2026-01-01T00:00:02.000Z" }),
      chat({ id: "x", text: "nope", userName: "x", displayName: "X" }),
    ]

    expect(
      ids(searchChatEntries(entries, parseChatSearchQuery("hello")))
    ).toEqual(["c", "b2", "b1", "a"])
  })
})

describe("mergeChatSearchResults", () => {
  test("deduplicates by channel and id and keeps sort order", () => {
    const parsed = parseChatSearchQuery("hello")
    const first = searchChatEntries(
      [
        chat({ id: "1", receivedAt: "2026-01-01T00:00:01.000Z" }),
        chat({ id: "3", receivedAt: "2026-01-01T00:00:03.000Z" }),
      ],
      parsed
    )
    const second = searchChatEntries(
      [
        chat({ id: "1", receivedAt: "2026-01-01T00:00:01.000Z" }),
        chat({
          id: "1",
          channel: "bravo",
          receivedAt: "2026-01-01T00:00:01.000Z",
        }),
        chat({ id: "2", receivedAt: "2026-01-01T00:00:02.000Z" }),
      ],
      parsed
    )
    const merged = mergeChatSearchResults(first, second)

    expect(
      merged.map((result) => `${result.message.channel}:${result.message.id}`)
    ).toEqual(["alpha:3", "alpha:2", "alpha:1", "bravo:1"])
  })

  test("returns the original array when one side is empty", () => {
    const results = searchChatEntries([chat()], parseChatSearchQuery("hello"))

    expect(mergeChatSearchResults(results, [])).toBe(results)
    expect(mergeChatSearchResults([], results)).toBe(results)
  })
})

describe("collectChatSearchEntries", () => {
  test("skips deleted, hidden, channel-less system and moderation queue items", () => {
    const visible = chatMessage({ text: "visible" })
    const deleted = chatMessage({ deletedAt: "2026-01-01T00:00:00.000Z" })
    const hidden = chatMessage({ userName: "blocked" })
    const event = systemMessage({ event: "raid" })
    const hiddenEvent = systemMessage({ event: "raid", text: "hide me" })
    const global = { ...systemMessage(), channel: null }
    const timeline: TwitchTimelineItem[] = [
      { kind: "chat", message: visible },
      { kind: "chat", message: deleted },
      { kind: "chat", message: hidden },
      { kind: "system", message: event },
      { kind: "system", message: hiddenEvent },
      { kind: "system", message: global },
      { kind: "automod", message: {} as never },
    ]

    const collected = collectChatSearchEntries(timeline, {
      includeDeleted: false,
      isHidden: (message) => message.userName === "blocked",
      isSystemHidden: (message) => message.text === "hide me",
    })

    expect(collected.map((entry) => entry.message.id)).toEqual([
      visible.id,
      event.id,
    ])
    expect(
      collectChatSearchEntries(timeline).map((entry) => entry.message.id)
    ).toEqual([visible.id, deleted.id, hidden.id, event.id, hiddenEvent.id])
  })
})

describe("collectRecentSearchUsernames", () => {
  test("lists most recent chatters first, deduplicated case-insensitively", () => {
    const timelines: TwitchTimelineItem[][] = [
      [
        {
          kind: "chat",
          message: chatMessage({ userName: "amy", displayName: "Amy" }),
        },
        {
          kind: "chat",
          message: chatMessage({ userName: "ben", displayName: "Ben" }),
        },
        { kind: "system", message: systemMessage() },
        {
          kind: "chat",
          message: chatMessage({ userName: "AMY", displayName: "AMY" }),
        },
      ],
      [
        {
          kind: "chat",
          message: chatMessage({ userName: "cat", displayName: "Cat" }),
        },
        {
          kind: "chat",
          message: chatMessage({ userName: "ben", displayName: "Ben" }),
        },
      ],
    ]

    expect(collectRecentSearchUsernames(timelines)).toEqual([
      { userName: "AMY", displayName: "AMY" },
      { userName: "ben", displayName: "Ben" },
      { userName: "cat", displayName: "Cat" },
    ])
  })
})

describe("updateChatSearchResults", () => {
  function item(message: TwitchChatMessage): TwitchTimelineItem {
    return { kind: "chat", message }
  }

  const baseInput = {
    open: true,
    includeDeleted: true,
    hideBlockedUsers: false,
  }

  test("clears the cache when closed or inactive", () => {
    const cache = createChatSearchResultsCache()
    const parsed = parseChatSearchQuery("hello")
    const timelines = [[item(chatMessage())]]

    expect(
      updateChatSearchResults(cache, { ...baseInput, parsed, timelines })
    ).toHaveLength(1)
    expect(
      updateChatSearchResults(cache, {
        ...baseInput,
        open: false,
        parsed,
        timelines,
      })
    ).toEqual([])
    expect(cache.parsed).toBeNull()
    expect(cache.results).toEqual([])
  })

  test("incrementally appends new matches and applies filters to them", () => {
    const cache = createChatSearchResultsCache()
    const parsed = parseChatSearchQuery("hello")
    const first = item(
      chatMessage({ id: "1", receivedAt: "2026-01-01T00:00:01.000Z" })
    )
    const isHidden = (message: TwitchChatMessage) => message.userName === "spam"

    updateChatSearchResults(cache, {
      ...baseInput,
      parsed,
      timelines: [[first]],
      isHidden,
    })
    const results = updateChatSearchResults(cache, {
      ...baseInput,
      parsed,
      timelines: [
        [
          first,
          item(
            chatMessage({ id: "2", receivedAt: "2026-01-01T00:00:02.000Z" })
          ),
          item(chatMessage({ id: "3", userName: "spam" })),
          item(chatMessage({ id: "4", text: "bye" })),
        ],
      ],
      isHidden,
    })

    expect(ids(results)).toEqual(["2", "1"])
  })

  test("recomputes from scratch when the timeline is trimmed", () => {
    const cache = createChatSearchResultsCache()
    const parsed = parseChatSearchQuery("hello")
    const first = item(chatMessage({ id: "1" }))
    const second = item(chatMessage({ id: "2" }))
    const third = item(chatMessage({ id: "3" }))

    updateChatSearchResults(cache, {
      ...baseInput,
      parsed,
      timelines: [[first, second]],
    })
    const results = updateChatSearchResults(cache, {
      ...baseInput,
      parsed,
      timelines: [[second, third]],
    })

    expect(ids(results).sort()).toEqual(["2", "3"])
  })

  test("recomputes when the nickname key changes", () => {
    const cache = createChatSearchResultsCache()
    const parsed = parseChatSearchQuery("pal")
    const timelines = [[item(chatMessage({ userName: "amy" }))]]

    expect(
      updateChatSearchResults(cache, {
        ...baseInput,
        parsed,
        timelines,
        nicknamesKey: "a",
      })
    ).toHaveLength(0)
    expect(
      updateChatSearchResults(cache, {
        ...baseInput,
        parsed,
        timelines,
        nicknamesKey: "b",
        getNicknameByLogin: () => "Pal",
      })
    ).toHaveLength(1)
  })
})

describe("getChatSearchSuggestions", () => {
  const channels: ChatSearchKnownChannel[] = [
    { login: "alpha", displayName: "Alpha" },
    { login: "bravo", displayName: "BravoTV" },
  ]
  const usernames = [
    { userName: "Alice", displayName: "Alice" },
    { userName: "bob", displayName: "Bobby" },
  ]

  function suggest(query: string, cursor = query.length) {
    return getChatSearchSuggestions({
      token: getChatSearchTokenAtCursor(query, cursor),
      query,
      parsed: parseChatSearchQuery(query),
      channels,
      usernames,
    }).map((suggestion) => suggestion.insert)
  }

  test("returns nothing for a blank query", () => {
    expect(suggest("")).toEqual([])
    expect(suggest("   ")).toEqual([])
  })

  test("suggests filter keys by prefix", () => {
    expect(suggest("f")).toEqual(["from:"])
    expect(suggest("hello ")).toEqual([])
    expect(suggest("in:alpha ")).toEqual(["in:", "from:", "role:", "has:"])
  })

  test("suggests negated filter keys with negated descriptions", () => {
    const suggestions = getChatSearchSuggestions({
      token: getChatSearchTokenAtCursor("!r", 2),
      query: "!r",
      parsed: parseChatSearchQuery("!r"),
      channels,
      usernames,
    })

    expect(suggestions).toEqual([
      {
        id: "!filter:role",
        insert: "!role:",
        label: "!role:",
        description: "Exclude a badge role",
      },
    ])
  })

  test("suggests channels with an all-channels option", () => {
    expect(suggest("in:")).toEqual(["in:*", "in:alpha", "in:bravo"])
    expect(suggest("in:br")).toEqual(["in:bravo"])
    expect(suggest('in:"Bravot')).toEqual(["in:bravo"])
    expect(suggest("!in:")).toEqual(["!in:alpha", "!in:bravo"])
  })

  test("suggests users by login or display name", () => {
    expect(suggest("from:@bobb")).toEqual(["from:bob"])
    expect(suggest("FROM:al")).toEqual(["from:Alice"])
  })

  test("suggests role and has values by prefix", () => {
    expect(suggest("role:m")).toEqual(["role:mod"])
    expect(suggest("has:li")).toEqual(["has:link"])
    expect(suggest("!has:rai")).toEqual(["!has:raid"])
    expect(suggest("nope:x")).toEqual([])
  })
})
