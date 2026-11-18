import { describe, expect, test } from "bun:test"

import {
  matchChatMentions,
  textHasChatMention,
} from "@/lib/chat/presentation/mentions"

function mentions(text: string) {
  return [...matchChatMentions(text)].map((match) => [match[0], match.index])
}

describe("matchChatMentions", () => {
  test("finds every mention with its index", () => {
    expect(mentions("@alice hi @Bob_2, and @carol!")).toEqual([
      ["@alice", 0],
      ["@Bob_2", 10],
      ["@carol", 22],
    ])
  })

  test("ignores @ preceded by a word character", () => {
    expect(mentions("mail me at user@example.com")).toEqual([])
    expect(mentions("x_@nope")).toEqual([])
  })

  test("allows punctuation and repeated @ before the mention", () => {
    expect(mentions("(@alice) @@bob")).toEqual([
      ["@alice", 1],
      ["@bob", 10],
    ])
  })

  test("does not match a bare @ or non-ASCII names", () => {
    expect(mentions("@ @ @日本")).toEqual([])
  })

  test("restarts from the beginning on every call", () => {
    const text = "@a @b"
    const iterator = matchChatMentions(text)
    iterator.next()
    expect(mentions(text)).toHaveLength(2)
  })
})

describe("textHasChatMention", () => {
  test("is stable across repeated calls on the global pattern", () => {
    expect(textHasChatMention("hey @alice")).toBe(true)
    expect(textHasChatMention("hey @alice")).toBe(true)
    expect(textHasChatMention("@a")).toBe(true)
    expect(textHasChatMention("no mention")).toBe(false)
    expect(textHasChatMention("a@b")).toBe(false)
  })
})
