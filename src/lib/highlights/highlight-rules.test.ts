import { describe, expect, test } from "bun:test"

import {
  compilePingRules,
  createPingRuleId,
  findPingMatchRange,
  getPingMatchPattern,
  getUsernameMentionRuleId,
  matchPingRules,
  messageMentionsUsername,
  resolveMessagePingMatch,
} from "@/lib/highlights/highlight-rules"
import type { HighlightPingRule } from "@/lib/peepochat/peepochat-config"
import type { TwitchChatGif, TwitchChatMessage } from "@/lib/twitch/chat/chat"

function message(text: string, gifs: TwitchChatGif[] = []): TwitchChatMessage {
  return {
    id: "msg-1",
    channel: "channel",
    roomId: null,
    sourceRoomId: null,
    userId: "1",
    userName: "someone",
    displayName: "Someone",
    text,
    color: null,
    receivedAt: "2026-01-01T00:00:00.000Z",
    badges: [],
    badgeInfo: [],
    emotes: [],
    gifs,
    reply: null,
    bits: null,
    deletedAt: null,
    flags: {
      isBroadcaster: false,
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      isFirst: false,
      isAction: false,
    },
  }
}

function rule(
  pattern: string,
  overrides: Partial<HighlightPingRule> = {}
): HighlightPingRule {
  return { id: pattern, pattern, enabled: true, notify: true, ...overrides }
}

function gif(start: number, end: number): TwitchChatGif {
  return { id: `${start}-${end}`, url: "https://example.com/a.gif", start, end }
}

describe("compilePingRules", () => {
  test("skips disabled, blank and invalid patterns", () => {
    const compiled = compilePingRules([
      rule("valid"),
      rule("disabled", { enabled: false }),
      rule("   "),
      rule("(unclosed"),
      rule("[a-"),
    ])

    expect(compiled.map((entry) => entry.id)).toEqual(["valid"])
  })

  test("trims patterns and compiles them case-insensitively", () => {
    const [compiled] = compilePingRules([rule("  hello  ", { id: "r1" })])

    expect(compiled?.pattern).toBe("hello")
    expect(compiled?.regex.test("say HELLO there")).toBe(true)
  })
})

describe("matchPingRules", () => {
  test("returns null when there are no rules or nothing matches", () => {
    expect(matchPingRules([], message("anything"))).toBeNull()
    expect(
      matchPingRules(compilePingRules([rule("foo")]), message("bar"))
    ).toBeNull()
  })

  test("returns the first matching rule in order", () => {
    const compiled = compilePingRules([
      rule("nope", { id: "a" }),
      rule("peepo", { id: "b", notify: false }),
      rule("pee", { id: "c" }),
    ])

    expect(matchPingRules(compiled, message("PeepoHappy hi"))).toEqual({
      ruleId: "b",
      pattern: "peepo",
      notify: false,
    })
  })

  test("supports regex syntax and is repeatable across calls", () => {
    const compiled = compilePingRules([rule("^!(raid|so)\\b")])

    expect(matchPingRules(compiled, message("!RAID now"))).not.toBeNull()
    expect(matchPingRules(compiled, message("!so someone"))).not.toBeNull()
    expect(matchPingRules(compiled, message("x !raid"))).toBeNull()
  })

  test("matches non-ASCII text case-insensitively", () => {
    const compiled = compilePingRules([rule("ÉCOLE")])

    expect(matchPingRules(compiled, message("à l'école"))).not.toBeNull()
  })

  test("ignores text inside GIF captions", () => {
    const text = "look catjam here"
    const compiled = compilePingRules([rule("catjam")])

    expect(matchPingRules(compiled, message(text, [gif(5, 10)]))).toBeNull()
    expect(matchPingRules(compiled, message(text, [gif(0, 3)]))).not.toBeNull()
  })

  test("masks multiple unordered and overlapping GIF captions", () => {
    const text = "aaa bbb ccc ddd"
    const compiled = compilePingRules([rule("aaa|bbb|ccc"), rule("ddd")])

    const gifs = [gif(8, 10), gif(0, 5), gif(3, 6)]
    expect(matchPingRules(compiled, message(text, gifs))?.ruleId).toBe("ddd")
  })

  test("clamps GIF ranges that extend past the text", () => {
    const compiled = compilePingRules([rule("ok")])

    expect(matchPingRules(compiled, message("ok gif", [gif(3, 50)]))).toEqual({
      ruleId: "ok",
      pattern: "ok",
      notify: true,
    })
  })
})

describe("messageMentionsUsername", () => {
  test.each([
    ["hey @rcw", true],
    ["hey RCW!", true],
    ["@Rcw, look", true],
    ["rcw", true],
    ["(rcw)", true],
    ["rcwfan here", false],
    ["the_rcw here", false],
    ["rcw-bot here", false],
    ["@rcw_alt here", false],
    ["x-rcw here", false],
    ["foo@rcw", false],
    ["mail me at me@rcw.com", false],
    ["x_@rcw here", false],
    ["1@rcw", false],
    ["(@rcw)", true],
    ["hi,@rcw", true],
    ["nobody", false],
  ])("%p -> %p", (text, expected) => {
    expect(messageMentionsUsername(message(text), "rcw")).toBe(expected)
  })

  test("normalizes the account login", () => {
    expect(messageMentionsUsername(message("hi rcw"), "  @RCW ")).toBe(true)
  })

  test("returns false for a blank login", () => {
    expect(messageMentionsUsername(message("hi @"), "  ")).toBe(false)
    expect(messageMentionsUsername(message("hi"), "@")).toBe(false)
  })

  test("ignores mentions inside GIF captions", () => {
    expect(
      messageMentionsUsername(message("@rcw gif", [gif(0, 3)]), "rcw")
    ).toBe(false)
  })
})

describe("resolveMessagePingMatch", () => {
  const options = { pingOnUsernameMention: true, accountLogin: "rcw" }

  test("prefers custom rules over username mentions", () => {
    const compiled = compilePingRules([rule("hello", { notify: false })])

    expect(
      resolveMessagePingMatch(compiled, message("hello rcw"), options)
    ).toEqual({ ruleId: "hello", pattern: "hello", notify: false })
  })

  test("falls back to a username mention match that always notifies", () => {
    expect(resolveMessagePingMatch([], message("yo @rcw"), options)).toEqual({
      ruleId: getUsernameMentionRuleId(),
      notify: true,
    })
  })

  test("does not match mentions when disabled or signed out", () => {
    expect(
      resolveMessagePingMatch([], message("yo @rcw"), {
        pingOnUsernameMention: false,
        accountLogin: "rcw",
      })
    ).toBeNull()
    expect(
      resolveMessagePingMatch([], message("yo @rcw"), {
        pingOnUsernameMention: true,
        accountLogin: null,
      })
    ).toBeNull()
  })
})

describe("getPingMatchPattern", () => {
  test("uses the account login for username mention matches", () => {
    expect(getPingMatchPattern(getUsernameMentionRuleId(), "x", "rcw")).toBe(
      "rcw"
    )
    expect(getPingMatchPattern(getUsernameMentionRuleId(), "x", null)).toBe("")
  })

  test("uses the compiled pattern for custom rules", () => {
    expect(getPingMatchPattern("rule", "pat", "rcw")).toBe("pat")
    expect(getPingMatchPattern("rule", undefined, "rcw")).toBe("")
  })
})

describe("findPingMatchRange", () => {
  const mentionId = getUsernameMentionRuleId()

  test("includes the @ in username mention ranges", () => {
    expect(findPingMatchRange("hi @Rcw!", mentionId, "rcw")).toEqual({
      start: 3,
      end: 7,
    })
    expect(findPingMatchRange("hi rcw", mentionId, "rcw")).toEqual({
      start: 3,
      end: 6,
    })
  })

  test("returns null for missing mentions or blank logins", () => {
    expect(findPingMatchRange("rcwfan", mentionId, "rcw")).toBeNull()
    expect(findPingMatchRange("foo@rcw", mentionId, "rcw")).toBeNull()
    expect(findPingMatchRange("rcw", mentionId, "")).toBeNull()
  })

  test("finds custom regex ranges case-insensitively", () => {
    expect(findPingMatchRange("Hello WORRLD", "rule", " wor+ld ")).toEqual({
      start: 6,
      end: 12,
    })
  })

  test("returns null for blank, invalid or unmatched patterns", () => {
    expect(findPingMatchRange("text", "rule", "  ")).toBeNull()
    expect(findPingMatchRange("text", "rule", "(")).toBeNull()
    expect(findPingMatchRange("text", "rule", "nope")).toBeNull()
  })

  test("skips matches inside GIF captions", () => {
    expect(
      findPingMatchRange("rcw rcw", mentionId, "rcw", [gif(0, 2)])
    ).toEqual({ start: 4, end: 7 })
    expect(findPingMatchRange("cat cat", "rule", "cat", [gif(0, 2)])).toEqual({
      start: 4,
      end: 7,
    })
  })
})

describe("createPingRuleId", () => {
  test("creates unique prefixed ids", () => {
    const first = createPingRuleId()
    const second = createPingRuleId()

    expect(first.startsWith("ping-")).toBe(true)
    expect(first).not.toBe(second)
  })
})
