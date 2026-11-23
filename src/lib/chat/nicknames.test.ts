import { describe, expect, test } from "bun:test"

import {
  applyNicknameMentions,
  createNicknameByLoginMap,
  createNicknameMentionMap,
  findNicknameByLogin,
  isValidNickname,
  isValidTwitchLogin,
} from "@/lib/chat/nicknames"

describe("isValidNickname", () => {
  test.each([
    ["a", true],
    ["Cat_123", true],
    ["a".repeat(25), true],
    ["", false],
    ["a".repeat(26), false],
    ["has space", false],
    ["dash-name", false],
    ["@cat", false],
    ["café", false],
  ])("%p -> %p", (value, expected) => {
    expect(isValidNickname(value)).toBe(expected)
  })
})

describe("isValidTwitchLogin", () => {
  test.each([
    ["abc", true],
    ["Some_User_1", true],
    ["a".repeat(25), true],
    ["ab", false],
    ["a".repeat(26), false],
    ["bad-login", false],
    [" abc", false],
  ])("%p -> %p", (value, expected) => {
    expect(isValidTwitchLogin(value)).toBe(expected)
  })
})

describe("findNicknameByLogin", () => {
  const entries = [
    { login: "alice", nickname: "Cat" },
    { login: "bob", nickname: "Dog" },
  ]

  test("normalizes the login before looking it up", () => {
    expect(findNicknameByLogin(entries, "  ALICE ")).toBe("Cat")
    expect(findNicknameByLogin(entries, "bob")).toBe("Dog")
  })

  test("returns null for missing or blank logins", () => {
    expect(findNicknameByLogin(entries, "carol")).toBeNull()
    expect(findNicknameByLogin(entries, "   ")).toBeNull()
    expect(findNicknameByLogin(entries, null)).toBeNull()
    expect(findNicknameByLogin(entries, undefined)).toBeNull()
  })
})

describe("createNicknameByLoginMap", () => {
  test("keys by normalized login and keeps nickname casing", () => {
    const map = createNicknameByLoginMap([
      { login: " Alice ", nickname: "Cat" },
      { login: "  ", nickname: "Ignored" },
    ])

    expect([...map]).toEqual([["alice", "Cat"]])
  })
})

describe("createNicknameMentionMap", () => {
  test("maps lowercased nicknames to lowercased logins", () => {
    const map = createNicknameMentionMap([
      { login: "Alice", nickname: "Cat" },
      { login: "bob", nickname: "" },
    ])

    expect([...map]).toEqual([["cat", "alice"]])
  })
})

describe("applyNicknameMentions", () => {
  const mentions = createNicknameMentionMap([
    { login: "alice", nickname: "Cat" },
    { login: "bob", nickname: "dog_2" },
  ])

  test("replaces nickname mentions case-insensitively", () => {
    expect(applyNicknameMentions("hi @CAT and @Dog_2", mentions)).toBe(
      "hi @alice and @bob"
    )
  })

  test("preserves trailing punctuation", () => {
    expect(applyNicknameMentions("@cat, @dog_2! (@cat)", mentions)).toBe(
      "@alice, @bob! (@alice)"
    )
  })

  test("only replaces whole mentions", () => {
    expect(
      applyNicknameMentions("@catfish cat x@cat @cat_ me@dog_2", mentions)
    ).toBe("@catfish cat x@cat @cat_ me@dog_2")
  })

  test("leaves unknown mentions and plain text untouched", () => {
    const text = "hello @someone"

    expect(applyNicknameMentions(text, mentions)).toBe(text)
    expect(applyNicknameMentions(text, new Map())).toBe(text)
    expect(applyNicknameMentions("", mentions)).toBe("")
  })

  test("replaces repeated mentions and requires a boundary before each", () => {
    expect(applyNicknameMentions("@cat @cat\n@dog_2", mentions)).toBe(
      "@alice @alice\n@bob"
    )
    expect(applyNicknameMentions("@cat@cat", mentions)).toBe("@alice@cat")
  })
})
