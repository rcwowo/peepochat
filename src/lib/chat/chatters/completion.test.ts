import { describe, expect, mock, test } from "bun:test"

import {
  applyChatterSuggestion,
  chatterMentionValue,
  findAtChatterSuggestions,
  findNicknameChatterMatches,
  getChatterSuggestionIndices,
  toChatterSuggestion,
} from "@/lib/chat/chatters/completion"
import type { ChannelChatter } from "@/lib/chat/chatters/store"

function chatter(
  login: string,
  overrides: Partial<ChannelChatter> = {}
): ChannelChatter {
  return {
    userId: `id-${login}`,
    login,
    displayName: login,
    color: "#ff0000",
    lastSeenAt: 0,
    flags: {
      isBroadcaster: false,
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      isFirst: false,
      isAction: false,
    },
    ...overrides,
  }
}

function logins(chatters: ChannelChatter[]) {
  return chatters.map((entry) => entry.login)
}

describe("toChatterSuggestion", () => {
  test("mentions by display name when it only differs in case", () => {
    const suggestion = toChatterSuggestion(
      chatter("xqc", { displayName: "xQc" })
    )

    expect(suggestion).toEqual({
      type: "chatter",
      login: "xqc",
      displayName: "xQc",
      color: "#ff0000",
      nickname: null,
      mention: "xQc",
    })
  })

  test("mentions by login when the display name is localized", () => {
    expect(
      toChatterSuggestion(chatter("hanguk", { displayName: "한국" })).mention
    ).toBe("hanguk")
  })

  test("prefers the nickname for the mention", () => {
    const suggestion = toChatterSuggestion(chatter("xqc"), "Juicer")

    expect(suggestion.nickname).toBe("Juicer")
    expect(chatterMentionValue(suggestion)).toBe("@Juicer")
  })
})

describe("findAtChatterSuggestions", () => {
  test("is inactive unless the word at the cursor starts with @", () => {
    expect(findAtChatterSuggestions("hi x@y", 6, [chatter("a")])).toEqual({
      query: "",
      replaceRange: null,
      active: false,
      suggestions: [],
      current: 0,
    })
  })

  test("suggests the given chatters for an @ word", () => {
    const result = findAtChatterSuggestions("hi @ab more", 6, [
      chatter("abc"),
      chatter("abd"),
    ])

    expect(result.active).toBe(true)
    expect(result.query).toBe("@ab")
    expect(result.replaceRange).toEqual({ start: 3, end: 6 })
    expect(result.suggestions.map((entry) => entry.login)).toEqual([
      "abc",
      "abd",
    ])
  })

  test("caps the number of suggestions", () => {
    const chatters = Array.from({ length: 30 }, (_, index) =>
      chatter(`user${index}`)
    )

    expect(findAtChatterSuggestions("@", 1, chatters).suggestions).toHaveLength(
      25
    )
  })

  test("resolves nicknames per chatter", () => {
    const getNicknameByLogin = mock((login: string) =>
      login === "abc" ? "Cat" : null
    )
    const result = findAtChatterSuggestions(
      "@",
      1,
      [chatter("abc"), chatter("abd")],
      { getNicknameByLogin }
    )

    expect(getNicknameByLogin).toHaveBeenCalledTimes(2)
    expect(result.suggestions.map((entry) => entry.mention)).toEqual([
      "Cat",
      "abd",
    ])
  })
})

describe("findNicknameChatterMatches", () => {
  const nicknames = new Map([
    ["alice", "cat"],
    ["bob", "catfish"],
    ["carol", "Caterpillar"],
    ["dave", "dog"],
  ])

  test("only returns chatters with a nickname matching the prefix", () => {
    const matches = findNicknameChatterMatches({
      chatters: [
        chatter("alice"),
        chatter("bob"),
        chatter("carol"),
        chatter("dave"),
        chatter("erin"),
      ],
      query: "CAT",
      nicknames,
    })

    expect(logins(matches).sort()).toEqual(["alice", "bob", "carol"])
  })

  test("looks nicknames up by lowercased login", () => {
    const matches = findNicknameChatterMatches({
      chatters: [chatter("Alice")],
      query: "ca",
      nicknames,
    })

    expect(logins(matches)).toEqual(["Alice"])
  })

  test("ranks exact matches first, then most recently seen", () => {
    const matches = findNicknameChatterMatches({
      chatters: [
        chatter("bob", { lastSeenAt: 300 }),
        chatter("carol", { lastSeenAt: 200 }),
        chatter("alice", { lastSeenAt: 100 }),
      ],
      query: "cat",
      nicknames,
    })

    expect(logins(matches)).toEqual(["alice", "bob", "carol"])
  })

  test("breaks recency ties by nickname", () => {
    const matches = findNicknameChatterMatches({
      chatters: [chatter("dave"), chatter("carol"), chatter("bob")],
      query: "",
      nicknames,
    })

    expect(logins(matches)).toEqual(["carol", "bob", "dave"])
  })

  test("returns every nicknamed chatter for an empty query by recency", () => {
    const matches = findNicknameChatterMatches({
      chatters: [
        chatter("alice", { lastSeenAt: 1 }),
        chatter("dave", { lastSeenAt: 3 }),
        chatter("erin", { lastSeenAt: 5 }),
      ],
      query: "",
      nicknames,
    })

    expect(logins(matches)).toEqual(["dave", "alice"])
  })

  test("skips blocked chatters", () => {
    const isBlocked = mock(
      (userId?: string | null, login?: string | null) =>
        userId === "id-alice" || login === "bob"
    )
    const matches = findNicknameChatterMatches({
      chatters: [chatter("alice"), chatter("bob"), chatter("carol")],
      query: "cat",
      nicknames,
      isBlocked,
    })

    expect(logins(matches)).toEqual(["carol"])
    expect(isBlocked).toHaveBeenCalledWith("id-alice", "alice")
  })
})

describe("applyChatterSuggestion", () => {
  test("replaces the @ word with the mention and a trailing space", () => {
    const suggestion = toChatterSuggestion(
      chatter("xqc", { displayName: "xQc" })
    )

    expect(
      applyChatterSuggestion("hi @xq", { start: 3, end: 6 }, suggestion)
    ).toEqual({ value: "hi @xQc ", caret: 8 })
  })

  test("appends the mention when there is no range", () => {
    expect(
      applyChatterSuggestion("hi", null, toChatterSuggestion(chatter("abc")))
    ).toEqual({ value: "hi @abc ", caret: 8 })
  })
})

describe("getChatterSuggestionIndices", () => {
  test("wraps in both directions", () => {
    expect(getChatterSuggestionIndices(1, 2, "next")).toBe(0)
    expect(getChatterSuggestionIndices(0, 2, "prev")).toBe(1)
  })
})
